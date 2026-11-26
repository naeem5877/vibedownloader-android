package com.vibedownloadermobile.ytdlp

import android.util.Log
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLException
import com.yausername.youtubedl_android.YoutubeDLRequest
import com.yausername.youtubedl_android.YoutubeDLResponse
import java.io.File
import java.io.InputStream
import java.io.InputStreamReader
import java.nio.charset.StandardCharsets
import java.util.regex.Pattern

/**
 * Memory-bounded replacement for `YoutubeDL.execute()`.
 *
 * Why this exists (Sentry VIBEDOWNLOADER-ANDROID-4):
 * youtubedl-android's `StreamProcessExtractor` / `StreamGobbler` append *every*
 * character of yt-dlp's stdout/stderr to an unbounded `StringBuffer`, one `char`
 * at a time, and hand the whole thing back in `YoutubeDLResponse`. When
 * `callback == null` the extractor additionally never resets its `currentLine`
 * builder on '\n', so the output is held in memory twice. A single
 * `--list-formats --verbose` on a playlist/channel URL is enough to need a
 * ~144 MB contiguous array, which cannot be satisfied inside Android's fixed
 * 256 MB Java heap (no matter how much physical RAM the phone has).
 *
 * This runner launches yt-dlp exactly like the library does (same command,
 * environment and process registry, so `YoutubeDL.destroyProcessById()` still
 * cancels it) but:
 *  - reads in 8 KB chunks instead of one char at a time,
 *  - caps every buffer (see [Capture]),
 *  - bounds the line buffer used for progress parsing,
 *  - kills the process and fails with a readable message when a JSON payload
 *    exceeds [MAX_JSON_CHARS] instead of dying with an OutOfMemoryError.
 *
 * It reaches the library's private state (python/yt-dlp paths, env, process map)
 * through reflection. The library is pinned in android/build.gradle
 * (youtubedlAndroidVersion); if a future version renames those fields this
 * falls back to the library's own `execute()` rather than failing.
 */
object BoundedYtDlp {

    private const val TAG = "BoundedYtDlp"

    /** Hard ceiling for stdout that the caller needs in full (yt-dlp JSON). */
    const val MAX_JSON_CHARS = 8 * 1024 * 1024

    /** Diagnostic/log output only keeps this many chars of stdout (the tail). */
    private const val TAIL_STDOUT_CHARS = 256 * 1024

    /** stderr keeps the head (first error line) and the tail (final error). */
    private const val STDERR_CHARS = 64 * 1024

    /** A progress "line" longer than this is garbage; the rest is dropped. */
    private const val MAX_LINE_CHARS = 4096

    enum class Capture {
        /** stdout is the payload (e.g. `--dump-single-json`): keep all of it up to [MAX_JSON_CHARS], else fail. */
        JSON,

        /** stdout is only progress/log noise: keep the last 256K chars for diagnostics. */
        TAIL,
    }

    private enum class Policy { ABORT, TAIL, HEAD_TAIL }

    // yt-dlp progress, same patterns the library uses (aria2c is not used by this app).
    private val DOWNLOAD_PATTERN: Pattern =
        Pattern.compile("\\[download\\]\\s+(\\d+\\.\\d)% .* ETA (\\d+):(\\d+)")
    private val FFMPEG_PATTERN: Pattern = Pattern.compile("size=.*")

    /**
     * Drop-in for `YoutubeDL.getInstance().execute(request, processId, redirectErrorStream, callback)`.
     */
    @JvmOverloads
    @Throws(
        YoutubeDLException::class,
        InterruptedException::class,
        YoutubeDL.CanceledException::class,
    )
    fun execute(
        request: YoutubeDLRequest,
        processId: String? = null,
        redirectErrorStream: Boolean = false,
        capture: Capture = Capture.JSON,
        callback: ((Float, Long, String) -> Unit)? = null,
    ): YoutubeDLResponse {
        val env = Internals.read()
        if (env == null) {
            Log.w(TAG, "Library internals unavailable, using unbounded YoutubeDL.execute()")
            return YoutubeDL.getInstance().execute(request, processId, redirectErrorStream, callback)
        }

        if (processId != null && env.processes.containsKey(processId)) {
            throw YoutubeDLException("Process ID already exists")
        }

        // --- Same request preparation the library performs -------------------
        if (!request.hasOption("--cache-dir") || request.getOption("--cache-dir") == null) {
            request.addOption("--no-cache-dir")
        }
        if (request.buildCommand().contains("libaria2c.so")) {
            request.addOption("--external-downloader-args", "aria2c:--summary-interval=1")
            request.addOption("--external-downloader-args", "aria2c:--ca-certificate=${env.sslCertFile}")
        }
        env.quickJsPath?.let { request.addOption("--js-runtimes", "quickjs:${it.absolutePath}") }
        env.ffmpegPath?.let { request.addOption("--ffmpeg-location", it.absolutePath) }

        val startTime = System.currentTimeMillis()
        val args = request.buildCommand()
        val command = ArrayList<String>(args.size + 2).apply {
            add(env.pythonPath.absolutePath)
            add(env.ytdlpPath.absolutePath)
            addAll(args)
        }

        val processBuilder = ProcessBuilder(command).redirectErrorStream(redirectErrorStream)
        processBuilder.environment().apply {
            put("LD_LIBRARY_PATH", env.ldLibraryPath.orEmpty())
            put("SSL_CERT_FILE", env.sslCertFile.orEmpty())
            put("PATH", System.getenv("PATH").orEmpty() + ":" + env.binDir.absolutePath)
            put("PYTHONHOME", env.pythonHome.orEmpty())
            put("HOME", env.pythonHome.orEmpty())
            put("TMPDIR", env.tmpDir.orEmpty())
        }

        val process = try {
            processBuilder.start()
        } catch (e: Exception) {
            throw YoutubeDLException(e)
        }
        if (processId != null) env.processes[processId] = process

        val outSink = BoundedText(
            if (capture == Capture.JSON) MAX_JSON_CHARS else TAIL_STDOUT_CHARS,
            if (capture == Capture.JSON) Policy.ABORT else Policy.TAIL,
        )
        val errSink = BoundedText(STDERR_CHARS, Policy.HEAD_TAIL)

        val progressTracker = callback?.let { ProgressTracker(it) }
        val outPump = StreamPump(
            stream = process.inputStream,
            sink = outSink,
            onLine = progressTracker?.let { t -> { line: String -> t.onLine(line) } },
            onOverflow = {
                Log.w(TAG, "stdout exceeded $MAX_JSON_CHARS chars; killing yt-dlp")
                abort(process, processId)
            },
        )
        val errPump = StreamPump(
            stream = process.errorStream,
            sink = errSink,
            onLine = null,
            onOverflow = null,
        )
        outPump.start()
        errPump.start()

        val exitCode: Int = try {
            outPump.join()
            errPump.join()
            process.waitFor()
        } catch (e: InterruptedException) {
            process.destroy()
            if (processId != null) env.processes.remove(processId)
            throw e
        }

        if (outSink.truncated && capture == Capture.JSON) {
            if (processId != null) env.processes.remove(processId)
            throw YoutubeDLException(
                "This link returned too much data to process (more than " +
                    "${MAX_JSON_CHARS / (1024 * 1024)} MB). It is probably a very large playlist or channel.",
            )
        }

        val out = outSink.toString()
        val err = errSink.toString()

        if (exitCode > 0) {
            if (processId != null && !env.processes.containsKey(processId)) {
                throw YoutubeDL.CanceledException()
            }
            if (!ignoreErrors(request, out)) {
                if (processId != null) env.processes.remove(processId)
                throw YoutubeDLException(err)
            }
        }

        if (processId != null) env.processes.remove(processId)
        return YoutubeDLResponse(command, exitCode, System.currentTimeMillis() - startTime, out, err)
    }

    /** Same rule as the library: only `--dump-json --ignore-errors` tolerates a non-zero exit. */
    private fun ignoreErrors(request: YoutubeDLRequest, out: String): Boolean =
        request.hasOption("--dump-json") && out.isNotEmpty() && request.hasOption("--ignore-errors")

    private fun abort(process: Process, processId: String?) {
        // The caller detects overflow via BoundedText.truncated before it looks at
        // cancellation, so removing the id from the library's map here is safe.
        if (processId != null) {
            runCatching { YoutubeDL.getInstance().destroyProcessById(processId) }
        }
        process.destroy()
    }

    // ------------------------------------------------------------------------

    /** Progress callback state, mirrors the library's `processOutputLine`. */
    private class ProgressTracker(private val callback: (Float, Long, String) -> Unit) {
        private var progress = -1f
        private var eta = -1L

        fun onLine(line: String) {
            val dl = DOWNLOAD_PATTERN.matcher(line)
            if (dl.find()) {
                progress = dl.group(1)?.toFloatOrNull() ?: progress
                eta = (dl.group(2)?.toLongOrNull() ?: 0L) * 60 + (dl.group(3)?.toLongOrNull() ?: 0L)
            } else if (FFMPEG_PATTERN.matcher(line).find()) {
                progress = 99f
            }
            try {
                callback(progress, eta, line)
            } catch (e: Exception) {
                Log.w(TAG, "progress callback threw: ${e.message}")
            }
        }
    }

    /**
     * Reads a process stream in chunks, feeds a [BoundedText], and optionally
     * splits it into '\r' / '\n' terminated lines for progress parsing.
     */
    private class StreamPump(
        private val stream: InputStream,
        private val sink: BoundedText,
        private val onLine: ((String) -> Unit)?,
        private val onOverflow: (() -> Unit)?,
    ) : Thread("ytdlp-stream-pump") {

        override fun run() {
            try {
                val reader = InputStreamReader(stream, StandardCharsets.UTF_8)
                val buf = CharArray(8192)
                val line = StringBuilder()
                while (true) {
                    val n = reader.read(buf)
                    if (n < 0) break
                    if (!sink.append(buf, 0, n)) {
                        onOverflow?.invoke()
                        break
                    }
                    if (onLine == null) continue
                    for (i in 0 until n) {
                        val c = buf[i]
                        if (c == '\r' || c == '\n') {
                            if (line.isNotEmpty()) {
                                onLine.invoke(line.toString())
                                line.setLength(0)
                            }
                        } else if (line.length < MAX_LINE_CHARS) {
                            line.append(c)
                        }
                    }
                }
            } catch (e: java.io.IOException) {
                // Normal when the process is killed (cancel / overflow).
                Log.d(TAG, "stream closed: ${e.message}")
            }
        }
    }

    /** Thread-safe text buffer with a hard memory ceiling. */
    private class BoundedText(private val cap: Int, private val policy: Policy) {
        private val head = StringBuilder()
        private val tail = StringBuilder()
        private val headCap = if (policy == Policy.HEAD_TAIL) cap / 2 else cap
        private val tailCap = if (policy == Policy.HEAD_TAIL) cap - headCap else cap

        @Volatile
        var truncated = false
            private set

        /** Returns false when [Policy.ABORT] hit its ceiling (caller should stop). */
        @Synchronized
        fun append(buf: CharArray, off: Int, len: Int): Boolean {
            when (policy) {
                Policy.ABORT -> {
                    val room = cap - head.length
                    if (len > room) {
                        if (room > 0) head.append(buf, off, room)
                        truncated = true
                        return false
                    }
                    head.append(buf, off, len)
                }
                Policy.TAIL -> appendTail(buf, off, len)
                Policy.HEAD_TAIL -> {
                    var o = off
                    var l = len
                    val room = headCap - head.length
                    if (room > 0) {
                        val take = minOf(room, l)
                        head.append(buf, o, take)
                        o += take
                        l -= take
                    }
                    if (l > 0) appendTail(buf, o, l)
                }
            }
            return true
        }

        private fun appendTail(buf: CharArray, off: Int, len: Int) {
            tail.append(buf, off, len)
            if (tail.length > tailCap * 2) {
                tail.delete(0, tail.length - tailCap)
                truncated = true
            }
        }

        @Synchronized
        override fun toString(): String {
            if (policy == Policy.ABORT) return head.toString()
            val t = if (tail.length > tailCap) {
                truncated = true
                tail.substring(tail.length - tailCap)
            } else {
                tail.toString()
            }
            return if (policy == Policy.HEAD_TAIL && truncated) {
                head.toString() + "\n...[output truncated]...\n" + t
            } else {
                head.toString() + t
            }
        }
    }

    // ------------------------------------------------------------------------

    /** Snapshot of the library's private state, read after `YoutubeDL.init()` has run. */
    private class Internals(
        val pythonPath: File,
        val ytdlpPath: File,
        val ffmpegPath: File?,
        val quickJsPath: File?,
        val binDir: File,
        val ldLibraryPath: String?,
        val sslCertFile: String?,
        val pythonHome: String?,
        val tmpDir: String?,
        val processes: MutableMap<String, Process>,
    ) {
        companion object {
            fun read(): Internals? = try {
                val cls = YoutubeDL::class.java
                fun field(name: String): Any? =
                    cls.getDeclaredField(name).apply { isAccessible = true }.get(null)

                val python = field("pythonPath") as? File
                val ytdlp = field("ytdlpPath") as? File
                val bin = field("binDir") as? File
                if (python == null || ytdlp == null || bin == null) {
                    // Not initialised yet: behave like the library's assertInit().
                    throw YoutubeDLException("instance not initialized")
                }
                @Suppress("UNCHECKED_CAST")
                Internals(
                    pythonPath = python,
                    ytdlpPath = ytdlp,
                    ffmpegPath = field("ffmpegPath") as? File,
                    quickJsPath = field("quickJsPath") as? File,
                    binDir = bin,
                    ldLibraryPath = field("ENV_LD_LIBRARY_PATH") as? String,
                    sslCertFile = field("ENV_SSL_CERT_FILE") as? String,
                    pythonHome = field("ENV_PYTHONHOME") as? String,
                    tmpDir = field("TMPDIR") as? String,
                    processes = field("idProcessMap") as MutableMap<String, Process>,
                )
            } catch (e: YoutubeDLException) {
                throw e
            } catch (e: Throwable) {
                Log.e(TAG, "Could not read youtubedl-android internals", e)
                null
            }
        }
    }
}
