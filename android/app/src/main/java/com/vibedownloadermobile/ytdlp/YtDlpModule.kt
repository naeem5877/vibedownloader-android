package com.vibedownloadermobile.ytdlp

import android.content.Intent
import android.content.Context
import android.content.ClipboardManager
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.os.Build
import android.os.Environment
import android.util.Log
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLException
import com.yausername.youtubedl_android.YoutubeDLRequest
import com.yausername.ffmpeg.FFmpeg
import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonParser
import org.jaudiotagger.audio.AudioFileIO
import org.jaudiotagger.tag.images.ArtworkFactory
import org.jaudiotagger.tag.FieldKey
import kotlinx.coroutines.*
import java.io.File
import java.io.FileInputStream
import java.io.BufferedInputStream
import java.io.FileOutputStream
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.Locale

class YtDlpModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val activeDownloads = ConcurrentHashMap<String, AtomicBoolean>()
    private var isInitialized = false
    private var notificationId = 1000
    
    companion object {
        const val NAME = "YtDlpModule"
        const val TAG = "YtDlpModule"
        const val CHANNEL_ID = "vibe_download_complete"
        const val CHANNEL_NAME = "Download Complete"
        const val CHANNEL_PROGRESS_ID = "vibe_download_progress"
        const val CHANNEL_PROGRESS_NAME = "Download Progress"

        /**
         * Wall-clock ceiling for the InnerTube fast path. Comfortably above the
         * ~250ms a healthy resolve costs, and far below the yt-dlp path it
         * falls back to, so a stalled request can never make a fetch slower
         * than it was before this existed.
         */
        private const val FAST_PATH_BUDGET_MS = 5_000L
        /** 8 MB - far above any real subtitle/lyrics file. */
        private const val MAX_TEXT_FILE_BYTES = 8L * 1024 * 1024
        
        // Supported platforms


        private val SUPPORTED_DOMAINS = listOf(
            "youtube.com", "youtu.be", "youtube-nocookie.com", "m.youtube.com",
            "music.youtube.com", // YouTube Music — must be listed explicitly before youtube.com
            "instagram.com", "www.instagram.com",
            "facebook.com", "fb.watch", "fb.com", "www.facebook.com", "m.facebook.com",
            "tiktok.com", "www.tiktok.com", "vm.tiktok.com",
            "spotify.com", "open.spotify.com",
            "tidal.com", "listen.tidal.com", "store.tidal.com",
            "twitter.com", "x.com", "mobile.twitter.com",
"pinterest.com", "pin.it", "www.pinterest.com",
  "soundcloud.com", "www.soundcloud.com", "m.soundcloud.com",
  // Twitch. clips.twitch.tv serves the clip short links, m.twitch.tv the
  // mobile site, and player.twitch.tv the embedded player URLs.
  "twitch.tv", "www.twitch.tv", "m.twitch.tv", "clips.twitch.tv", "player.twitch.tv"
  )

        private val SHORT_PATTERNS = listOf(
            "/shorts/", "/reel/", "/reels/", "/short/", "vm.tiktok.com"
        )

        // Standard desktop UA, which avoids the simple bot protections on
        // TikTok and Instagram. Deliberately not --impersonate, which needs
        // curl-cffi and is unavailable on Android.
        private const val DESKTOP_USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

        // Caption extraction is a live request per attempt, so a failure may be a
        // transient 429. One retry covers the common case without making the
        // picker feel broken on a genuinely captionless video.
        private const val SUBTITLE_ATTEMPTS = 2
        private const val SUBTITLE_RETRY_MS = 1200
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        initializeYtDlp()
        createNotificationChannel()
    }
    
    private fun initializeYtDlp() {
        if (isInitialized) return
        try {
            YoutubeDL.getInstance().init(reactApplicationContext)
            try {
                FFmpeg.getInstance().init(reactApplicationContext)
            } catch (t: Throwable) {
                try {
                    FFmpeg.init(reactApplicationContext)
                } catch (t2: Throwable) {
                    Log.w(TAG, "FFmpeg fallback init: ${t2.message}")
                }
            }
            Webp16kPatcher.apply(reactApplicationContext)
            isInitialized = true
            Log.d(TAG, "YtDlp & FFmpeg initialized successfully")
            
            // Auto-update yt-dlp in background to ensure latest version
            scope.launch {
                try {
                    Log.d(TAG, "Checking for yt-dlp updates...")
                    val status = YoutubeDL.getInstance().updateYoutubeDL(
                        reactApplicationContext, 
                        YoutubeDL.UpdateChannel.STABLE
                    )
                    Log.d(TAG, "yt-dlp update status: ${status?.name ?: "UNKNOWN"}")
                } catch (e: Exception) {
                    Log.w(TAG, "yt-dlp update check failed (non-critical): ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize YtDlp", e)
        }
    }

/**
     * Locates a *runnable* ffmpeg, or null when none can be executed.
     *
     * Existence is not enough: the directory the library unpacks into
     * (`packages/ffmpeg`) contains no binaries at all, and the shipped
     * `libffmpeg.so` is only usable when its 4KB-aligned shared libraries match
     * the device page size. Passing a bogus path here made yt-dlp report
     * "ffprobe and ffmpeg not found" even when its own detection would have
     * worked, so we verify by actually running the binary.
     */
    private fun getFFmpegLocation(): String? = ffmpegBinary()?.absolutePath

    @Volatile
    private var ffmpegProbe: String? = null

    @Volatile
    private var ffmpegProbed = false

    @Volatile
    private var ffmpegRuns: Boolean? = null

    /**
     * Locates the ffmpeg executable that ships inside the APK.
     *
     * Only a positive result is cached. The binary arrives as a zip in
     * `libffmpeg.zip.so` that `FFmpeg.init()` unpacks in `Application.onCreate`,
     * so an early call can legitimately find nothing yet; remembering that miss
     * would report ffmpeg as missing for the rest of the process and read to
     * the user as "ffmpeg is not installed".
     */
    private fun ffmpegBinary(): File? {
        if (ffmpegProbed) return ffmpegProbe?.let { File(it) }
        val nativeDir = reactApplicationContext.applicationInfo.nativeLibraryDir
        val base = File(reactApplicationContext.noBackupFilesDir, "youtubedl-android/packages/ffmpeg")
        val candidates = listOf(
            File(nativeDir, "libffmpeg.so"),
            File(base, "usr/bin/ffmpeg"),
            File(base, "bin/ffmpeg"),
            File(base, "ffmpeg"),
        )
        val found = candidates.firstOrNull { it.isFile && isExecutable(it) }
        if (found != null) {
            ffmpegProbe = found.absolutePath
            ffmpegProbed = true
            Log.d(TAG, "FFmpeg binary (bundled in app): ${found.absolutePath}")
        } else {
            Log.w(TAG, "Bundled ffmpeg not unpacked yet; will re-probe")
        }
        return found
    }

    /**
     * Search path the bundled ffmpeg needs to start.
     *
     * ffmpeg's own libraries are not enough: libfontconfig (pulled in by ffmpeg)
     * needs libexpat, which ships in the *python* package, and the loader
     * answers with `library "libexpat.so.1" not found`. youtubedl-android sets
     * both directories when it runs yt-dlp, so downloads worked, while our own
     * probe and clip-cutting used only the ffmpeg directory and therefore always
     * reported "ffmpeg cannot start on this device".
     */
    private fun ffmpegLibraryPath(): String {
        val packages = File(reactApplicationContext.noBackupFilesDir, "youtubedl-android/packages")
        val nativeDir = reactApplicationContext.applicationInfo.nativeLibraryDir
        return listOf(File(packages, "python/usr/lib"), File(packages, "ffmpeg/usr/lib"))
            .filter { it.isDirectory }
            .map { it.absolutePath }
            .plus(nativeDir)
            .joinToString(":")
    }

    /** True when the bundled binaries can actually be executed on this device. */
    fun isFfmpegAvailable(): Boolean {
        // Only a positive answer is final. A failure can be transient (the
        // libraries are still being unpacked on first launch), and caching it
        // would disable trimming until the app process is killed.
        if (ffmpegRuns == true) return true
        val binary = ffmpegBinary() ?: return false
        return try {
            val builder = ProcessBuilder(binary.absolutePath, "-version")
                .redirectErrorStream(true)
            builder.environment()["LD_LIBRARY_PATH"] = ffmpegLibraryPath()
            val process = builder.start()
            val output = process.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
            if (!process.waitFor(8, java.util.concurrent.TimeUnit.SECONDS)) {
                process.destroy()
                false
            } else if (process.exitValue() == 0) {
                true
            } else {
                // The loader's message says exactly why (missing library, 16KB
                // page-size alignment, ...). Keep it in the log.
                Log.w(TAG, "ffmpeg -version failed (${process.exitValue()}): ${output.take(300)}")
                false
            }
        } catch (e: Exception) {
            Log.w(TAG, "ffmpeg probe failed: ${e.message}")
            false
        }.also { if (it) ffmpegRuns = true }
    }

private fun isExecutable(file: File): Boolean = try {
        file.canExecute() || file.setExecutable(true, true)
    } catch (e: Exception) {
        false
    }

    /**
     * Path to the bundled QuickJS binary (libqjs.so), or null if unusable.
     *
     * yt-dlp's JS challenge solver (`yt_dlp_ejs`) ships inside the bundled
     * yt-dlp zipapp, so no remote component fetch is needed. What it does need is
     * an interpreter, and with none available YouTube n-sig / player challenges
     * fall back to the pure-Python interpreter and cost 30-40s. QuickJS is ~1MB
     * and does it in a fraction of that.
     *
     * yt-dlp runs this as `libqjs.so --script <tmpfile>`, so it has to be
     * executable, not merely present. Libraries unpacked into nativeLibraryDir
     * are not guaranteed to carry the exec bit, so it is set explicitly rather
     * than assumed.
     *
     * Only a positive result is cached. Like ffmpeg, the binary may not be
     * unpacked yet on an early call, and remembering that miss would cost the
     * whole process its JS runtime.
     */
    private fun quickJsPath(): String? {
        if (quickJsProbed) return quickJsProbe
        val nativeDir = reactApplicationContext.applicationInfo.nativeLibraryDir
        val packages = File(reactApplicationContext.noBackupFilesDir, "youtubedl-android/packages")
        val candidates = listOf(
            File(nativeDir, "libqjs.so"),
            File(packages, "quickjs/usr/bin/qjs"),
            File(packages, "quickjs/bin/qjs"),
            File(packages, "qjs"),
        )
        val found = candidates.firstOrNull { it.isFile && isExecutable(it) }
        if (found != null) {
            quickJsProbe = found.absolutePath
            quickJsProbed = true
            Log.d(TAG, "QuickJS binary (bundled in app): ${found.absolutePath}")
        } else {
            Log.w(TAG, "Bundled QuickJS not usable yet; will re-probe")
        }
        return found?.absolutePath
    }

    @Volatile
    private var quickJsProbe: String? = null

    @Volatile
    private var quickJsProbed = false

    /**
     * True when the bundled QuickJS binary can actually be executed here.
     *
     * yt-dlp only reaches for a runtime when it has to solve a challenge, and it
     * treats a runtime that fails to launch as a hard extraction error. Attaching
     * a broken one would therefore break downloads that worked before, so the
     * binary is executed once and only attached if it answers.
     *
     * Only a positive answer is cached: the libraries may still be unpacking on
     * an early call, and caching that miss would cost the process its runtime.
     */
    private fun isQuickJsAvailable(): Boolean {
        if (quickJsRuns == true) return true
        val binary = quickJsPath() ?: return false
        return try {
            val process = ProcessBuilder(binary, "--help")
                .redirectErrorStream(true)
                .start()
            val output = process.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
            if (!process.waitFor(8, java.util.concurrent.TimeUnit.SECONDS)) {
                process.destroy()
                false
            } else if (process.exitValue() == 0) {
                true
            } else {
                // The loader's message says exactly why (missing library,
                // wrong page size, ...). Keep it in the log.
                Log.w(TAG, "QuickJS --help failed (${process.exitValue()}): ${output.take(300)}")
                false
            }
        } catch (e: Exception) {
            Log.w(TAG, "QuickJS probe failed: ${e.message}")
            false
        }.also { if (it) quickJsRuns = true }
    }

    @Volatile
    private var quickJsRuns: Boolean? = null

    /**
     * Attach the JS runtime so yt-dlp uses QuickJS instead of its slow
     * pure-Python interpreter.
     *
     * `--no-js-runtimes` has to come first: only "deno" is enabled by default,
     * and clearing the defaults before enabling QuickJS keeps the choice
     * deterministic rather than depending on what happens to be installed.
     */
    private fun applyJsRuntime(request: YoutubeDLRequest) {
        if (!isQuickJsAvailable()) return
        val path = quickJsPath() ?: return
        request.addOption("--no-js-runtimes")
        request.addOption("--js-runtimes", "quickjs:$path")
    }

    // ---------------------------------------------------------------------
    // Clip cutting
    //
    // The desktop app cuts by post-processing the finished file with ffmpeg
    // rather than asking yt-dlp for a byte range (`--download-sections` also
    // shells out to ffmpeg, and it forfeits the direct-CDN fast path). This is
    // the same two-step strategy: stream copy first, and only re-encode when
    // the copy fails, which happens whenever the in/out points do not land on
    // keyframe boundaries.
    // ---------------------------------------------------------------------

    /** ffmpeg subprocesses currently cutting, so cancelDownload() can kill them. */
    private val activeCutProcesses = ConcurrentHashMap<String, Process>()

    private val CUT_TIMEOUT_MINUTES = 30L

    /** Formats that carry no video track, so the re-encode must not force one. */
    private val AUDIO_ONLY_EXT = setOf("mp3", "m4a", "aac", "opus", "ogg", "wav", "flac")

    /**
     * Formats a timestamp the way ffmpeg parses it: `H:MM:SS.cc`, two decimals
     * (10 ms resolution, the same precision the desktop app passes).
     */
    private fun fmtSec(seconds: Double): String {
        val safe = if (seconds.isFinite() && seconds > 0) seconds else 0.0
        val h = Math.floor(safe / 3600)
        val m = Math.floor((safe % 3600) / 60)
        val sec = (safe % 60)
        return String.format(Locale.US, "%d:%02d:%06.3f", h.toInt(), m.toInt(), sec)
    }

    /**
     * Runs the bundled ffmpeg with the same library search path the availability
     * probe uses, returning the exit code, or null when it could not be run.
     *
     * [processId] registers the process so a user-initiated cancel can destroy
     * it, and [isCancelled] aborts a cut that was cancelled mid-flight.
     */
    private fun runFfmpeg(
        args: List<String>,
        processId: String,
        isCancelled: AtomicBoolean
    ): Int? {
        val binary = ffmpegBinary() ?: return null
        return try {
            val builder = ProcessBuilder(listOf(binary.absolutePath) + args)
                .redirectErrorStream(true)
            builder.environment()["LD_LIBRARY_PATH"] = ffmpegLibraryPath()

            val process = builder.start()
            activeCutProcesses[processId] = process
            try {
                // Drain stdout so ffmpeg never blocks on a full pipe buffer.
                val output = process.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
                val finished = process.waitFor(CUT_TIMEOUT_MINUTES, java.util.concurrent.TimeUnit.MINUTES)
                if (!finished) {
                    process.destroyForcibly()
                    Log.w(TAG, "ffmpeg cut timed out after $CUT_TIMEOUT_MINUTES minutes")
                    return null
                }
                val code = process.exitValue()
                if (code != 0) {
                    Log.w(TAG, "ffmpeg exited $code: ${output.take(400)}")
                }
                code
            } finally {
                activeCutProcesses.remove(processId)
            }
        } catch (e: Exception) {
            Log.e(TAG, "ffmpeg cut failed to run", e)
            null
        }
    }

    /**
     * Cuts [source] to the half-open range [start, end) and returns the new file.
     *
     * Tries a stream copy first (`-c copy`), which is near-instant but snaps the
     * in-point back to the nearest keyframe, then falls back to a real H.264 /
     * AAC re-encode for exact boundaries. Returns null if both attempts fail, in
     * which case the caller keeps the full-length file.
     */
    private fun cutMediaFile(
        source: File,
        start: Double,
        end: Double,
        processId: String,
        isCancelled: AtomicBoolean
    ): File? {
        if (!source.exists()) return null
        val clipDuration = end - start
        if (clipDuration <= 0) return null

        val ext = source.extension.ifEmpty { "mp4" }
        // The range is baked into the name so the published file is identifiable,
        // matching the desktop app's `_cut_<start>-<end>` suffix.
        val outFile = File(
            source.parentFile,
            "${source.nameWithoutExtension}_cut_${Math.round(start)}-${Math.round(end)}.$ext"
        )
        if (outFile.exists() && !outFile.delete()) {
            Log.w(TAG, "Could not replace existing cut file ${outFile.name}")
            return null
        }

        val audioOnly = ext.lowercase() in AUDIO_ONLY_EXT
        val startArg = fmtSec(start)
        val durationArg = fmtSec(clipDuration)

        // Attempt 1: stream copy. Fast and lossless, boundaries snap to keyframes.
        // No faststart here: -c copy already remuxes, and forcing a second
        // pass would defeat the point of the copy path. Desktop behaves the same.
        val copyArgs = listOf(
            "-hide_banner", "-loglevel", "error", "-y",
            "-ss", startArg, "-i", source.absolutePath,
            "-t", durationArg,
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            outFile.absolutePath
        )
        if (runFfmpeg(copyArgs, processId, isCancelled) == 0 && outFile.exists() && outFile.length() > 0) {
            return outFile
        }
        outFile.delete()

        if (isCancelled.get()) return null

        // Attempt 2: re-encode. Exact boundaries, far slower.
        val reencode = mutableListOf(
            "-hide_banner", "-loglevel", "error", "-y",
            "-ss", startArg, "-i", source.absolutePath,
            "-t", durationArg
        )
        val faststartTarget = ext.equals("mp4", true) || ext.equals("mov", true)
        if (audioOnly) {
            // Only m4a can hold AAC; for mp3/opus/ogg/wav/flac let ffmpeg pick
            // the container's own default codec. Forcing AAC into an .mp3
            // produces an unplayable file.
            if (ext.equals("m4a", true)) {
                reencode.addAll(listOf("-c:a", "aac", "-b:a", "192k"))
                reencode.addAll(listOf("-movflags", "+faststart"))
            }
        } else {
            reencode.addAll(
                listOf(
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                    "-c:a", "aac", "-b:a", "192k",
                    "-pix_fmt", "yuv420p"
                )
            )
            if (faststartTarget) reencode.addAll(listOf("-movflags", "+faststart"))
        }
        reencode.add(outFile.absolutePath)

        if (runFfmpeg(reencode.toList(), processId, isCancelled) == 0 && outFile.exists() && outFile.length() > 0) {
            return outFile
        }
        outFile.delete()
        Log.w(TAG, "Cut failed for ${source.name}; keeping the full-length file")
        return null
    }

     /**
     * Counts formats each YouTube player client can still see.

     *
     * YouTube keeps switching clients to SABR-only streaming, which looks exactly
     * like a broken link from the outside. Run detached from the error path.
     */
    private fun probeClientMatrix(url: String) {
        scope.launch {
            val report = StringBuilder()
            for (client in listOf("web_embedded", "web", "ios", "android", "android_vr")) {
                try {
                    val probe = YoutubeDLRequest(url)
                    probe.addOption("--force-ipv4")
                    probe.addOption("--no-check-certificate")
                    probe.addOption("--socket-timeout", "30")
                    probe.addOption("--user-agent", DESKTOP_USER_AGENT)
                    probe.addOption("--list-formats")
                    probe.addOption("--extractor-args", "youtube:player_client=$client")
                    applyJsRuntime(probe)
                    val out = YoutubeDL.getInstance().execute(probe, null, true, null).out.orEmpty()
                    val rows = out.lineSequence().filter { it.contains('|') }.toList()
                    val usable = rows.count { !it.contains("storyboard") && !it.contains("images") }
                    report.appendLine("  $client -> $usable playable / ${rows.size} listed")
                } catch (probeError: Exception) {
                    report.appendLine("  $client -> ERROR ${probeError.message?.lineSequence()?.first()?.take(120)}")
                }
            }
            Log.w(TAG, "player client matrix:\n$report")
        }
    }

/**
 * Returns a short explanation immediately and keeps the slow, precise diagnosis
 * off the critical path.
 *
 * Re-running extraction just to classify the failure doubled the wait on an
 * already-failing fetch, so the probe is detached: the caller gets a message now
 * and the verbose detail lands in logcat a few seconds later.
 */
private fun explainFetchFailure(url: String, playerClients: String?, error: String?): String {
    val detail = error?.lineSequence()?.firstOrNull { it.isNotBlank() }?.trim().orEmpty()
    scope.launch { probeVerbose(url, playerClients) }

    return when {
        detail.contains("Private video", ignoreCase = true) ->
            "This video is private, so there is nothing to download."

        detail.contains("members-only", ignoreCase = true) ||
            detail.contains("join this channel", ignoreCase = true) ->
            "This video is members-only."

        detail.contains("not a bot", ignoreCase = true) ||
            detail.contains("Sign in to confirm", ignoreCase = true) ->
            "YouTube wants a signed-in visitor to confirm this is not a bot. Signing in " +
                "(Settings -> YouTube -> Login) supplies cookies and resolves it."

        detail.contains("Video unavailable", ignoreCase = true) ||
            detail.contains("removed by the uploader", ignoreCase = true) ->
            "YouTube says this video is unavailable."

        detail.contains("Requested format is not available", ignoreCase = true) ||
            detail.contains("No video formats found", ignoreCase = true) ->
            "YouTube offered no downloadable video formats for this video. This is a " +
                "YouTube-side restriction, not a bad link."

        detail.isNotBlank() ->
            "yt-dlp could not extract this URL.\n\nyt-dlp said: ${detail.removePrefix("ERROR: ")}"

        else ->
            "yt-dlp could not extract this URL and gave no further detail."
    }
}

/** Detached verbose probe. Slow on purpose; never blocks the error the user sees. */
private suspend fun probeVerbose(url: String, playerClients: String?) {
    var out = ""
    var err = ""
    var exitCode = -1
    runCatching {
        val probe = YoutubeDLRequest(url)
        probe.addOption("--force-ipv4")
        probe.addOption("--socket-timeout", "15")
        probe.addOption("--user-agent", DESKTOP_USER_AGENT)
        probe.addOption("--list-formats")
        probe.addOption("--verbose")
        if (!playerClients.isNullOrEmpty()) {
            probe.addOption("--extractor-args", "youtube:player_client=$playerClients")
        }
        applyJsRuntime(probe)
        val response = YoutubeDL.getInstance().execute(probe, null, true, null)
        out = response.out.orEmpty()
        err = response.err.orEmpty()
        exitCode = response.exitCode
    }.onFailure { Log.w(TAG, "probeVerbose failed: ${it.message}") }

    val version = runCatching { YoutubeDL.getInstance().version(reactApplicationContext) }
        .getOrDefault("unknown")
    Log.w(TAG, "probe url=$url ytdlp=$version players=$playerClients exit=$exitCode")
    if (out.isNotBlank()) Log.w(TAG, "probe stdout:\n${out.take(2000)}")
    if (err.isNotBlank()) Log.w(TAG, "probe stderr:\n${err.takeLast(4000)}")
    if (out.contains("SABR", ignoreCase = true)) probeClientMatrix(url)
}

/**
 * Title/uploader/thumbnail in a single small HTTP request.
 *
 * Full extraction has to wait on YouTube's player handshake and costs tens of
 * seconds, but the details screen only needs these three fields to render. oEmbed
 * answers in well under a second, so the card can appear immediately while the
 * real formats, subtitles and audio tracks load behind it.
 */
@ReactMethod
fun fetchQuickInfo(url: String, promise: Promise) {
    scope.launch {
        val platform = getPlatformName(url)
        if (platform != "YouTube") {
            withContext(Dispatchers.Main) { promise.resolve(null) }
            return@launch
        }
        val started = System.currentTimeMillis()
        val quick = runCatching {
            val endpoint = java.net.URL(
                "https://www.youtube.com/oembed?format=json&url=" +
                    java.net.URLEncoder.encode(url, "UTF-8")
            )
            val connection = endpoint.openConnection() as java.net.HttpURLConnection
            try {
                connection.setRequestProperty("User-Agent", DESKTOP_USER_AGENT)
                connection.connectTimeout = 5_000
                connection.readTimeout = 5_000
                connection.connect()

                // getInputStream() throws on 4xx/5xx, which runCatching turns into a
                // null result - the common case for private/removed videos.
                val body = connection.inputStream.bufferedReader().use { it.readText() }
                val json = JsonParser.parseString(body).asJsonObject
                val title = json.get("title")?.asString?.takeIf { it.isNotBlank() }
                if (title == null) null else WritableNativeMap().apply {
                    putString("platform", platform)
                    putString("title", title)
                    putString("uploader", json.get("author_name")?.asString.orEmpty())
                    putString("thumbnail", json.get("thumbnail_url")?.asString.orEmpty())
                }
            } finally {
                connection.disconnect()
            }
        }.getOrNull()
        Log.d(TAG, "fetchQuickInfo took ${System.currentTimeMillis() - started}ms ok=${quick != null}")
        withContext(Dispatchers.Main) { promise.resolve(quick) }
    }
}

/**
     * Whether yt-dlp postprocessing (MP3/WAV conversion, DASH muxing) can run.
     *
     * The bundled ffmpeg is built with 4KB page alignment, so on devices using
     * 16KB pages it fails to load and every postprocessing step fails. Callers
     * use this to offer only formats that need no postprocessing.
     */
    @ReactMethod
    fun isFfmpegAvailable(promise: Promise) {
        scope.launch {
            val available = withContext(Dispatchers.IO) { isFfmpegAvailable() }
            withContext(Dispatchers.Main) { promise.resolve(available) }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = NotificationManager.IMPORTANCE_DEFAULT
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                description = "Notifications for completed downloads"
            }
            // Channel 2: Progress (Low importance to avoid sound spam)
            val progressImportance = NotificationManager.IMPORTANCE_LOW
            val progressChannel = NotificationChannel(CHANNEL_PROGRESS_ID, CHANNEL_PROGRESS_NAME, progressImportance).apply {
                description = "Shows active download progress"
                setSound(null, null)
            }
            
            val notificationManager = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
            notificationManager.createNotificationChannel(progressChannel)
        }
    }

    private fun showProgressNotification(processId: String, title: String, progress: Int, line: String) {
        try {
            // Generate a unique Int ID based on processId string hash code
            val notifId = processId.hashCode()

            val builder = NotificationCompat.Builder(reactApplicationContext, CHANNEL_PROGRESS_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(if (title.length > 25) title.substring(0, 25) + "..." else title)
                .setContentText(line) // e.g. "55% - 2.5MiB/s"
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOnlyAlertOnce(true) // Updates won't re-alert
                .setOngoing(true) // Cannot be swiped away
                .setProgress(100, progress, progress == 0)

            with(NotificationManagerCompat.from(reactApplicationContext)) {
                if (androidx.core.content.ContextCompat.checkSelfPermission(
                        reactApplicationContext,
                        android.Manifest.permission.POST_NOTIFICATIONS
                    ) == android.content.pm.PackageManager.PERMISSION_GRANTED
                ) {
                    notify(notifId, builder.build())
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to show progress notification: ${e.message}")
        }
    }

    private fun cancelNotification(processId: String) {
        try {
            val notifId = processId.hashCode()
            NotificationManagerCompat.from(reactApplicationContext).cancel(notifId)
        } catch (e: Exception) {
             Log.w(TAG, "Failed to cancel notification")
        }
    }
    
    private fun updateServiceState() {
        try {
            val intent = Intent(reactApplicationContext, DownloadForegroundService::class.java)
            if (activeDownloads.isNotEmpty()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    reactApplicationContext.startForegroundService(intent)
                } else {
                    reactApplicationContext.startService(intent)
                }
            } else {
                reactApplicationContext.stopService(intent)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to update service state: ${e.message}")
        }
    }

    private fun showDownloadNotification(title: String, filePath: String, platform: String) {
        try {
            val file = File(filePath)
            if (!file.exists()) return
            
            // Create intent to open file
            val fileUri = FileProvider.getUriForFile(
                reactApplicationContext,
                "${reactApplicationContext.packageName}.fileprovider",
                file
            )
            
            val mimeType = when {
                filePath.endsWith(".mp4") -> "video/mp4"
                filePath.endsWith(".mp3") -> "audio/mpeg"
                filePath.endsWith(".m4a") -> "audio/m4a"
                filePath.endsWith(".flac") -> "audio/flac"
                filePath.endsWith(".webm") -> "video/webm"
                else -> "*/*"
            }
            
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(fileUri, mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            
            val pendingIntent = PendingIntent.getActivity(
                reactApplicationContext,
                notificationId,
                intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            
            val notification = NotificationCompat.Builder(reactApplicationContext, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle("✅ Download Complete")
                .setContentText(title)
                .setSubText(platform)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .build()
            
            NotificationManagerCompat.from(reactApplicationContext).notify(notificationId++, notification)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show notification", e)
        }
    }

    private fun isValidPlatform(url: String): Boolean {
        // Always allow direct file downloads (regardless of domain)
        val lowerUrl = url.lowercase()
        if (lowerUrl.contains(".flac") || lowerUrl.contains(".mp3") || lowerUrl.contains(".m4a") || lowerUrl.contains(".mp4")) {
            return true
        }

        return try {
            val host = java.net.URI(url).host?.lowercase() ?: return false
            // Allow generic audio/video CDNs
            if (host.contains(".audio") || host.contains("googlevideo.com") || host.contains("fbcdn.net")) return true
            
            SUPPORTED_DOMAINS.any { domain -> 
                host == domain || host.endsWith(".$domain") 
            }
        } catch (e: Exception) {
            // If URI parsing fails, but yt-dlp might handle it, let's be lenient if it looks like a URL
            url.startsWith("http")
        }
    }
    
    private fun getPlatformName(url: String): String {
        return try {
            val host = java.net.URI(url).host?.lowercase() ?: return "Unknown"
            when {
                host.contains("youtube") || host.contains("youtu.be") -> "YouTube"
                host.contains("instagram") -> "Instagram"
                host.contains("facebook") || host.contains("fb.") -> "Facebook"
                host.contains("tiktok") -> "TikTok"
                host.contains("spotify") -> "Spotify"
                host.contains("twitter") || host.contains("x.com") -> "X"
                host.contains("pinterest") || host.contains("pin.it") -> "Pinterest"
host.contains("soundcloud") -> "SoundCloud"
  host.contains("twitch.tv") -> "Twitch"
  else -> "Unknown"
            }
        } catch (e: Exception) {
            "Unknown"
        }
    }

    private fun getContentType(url: String, platform: String): String {
        val urlLower = url.lowercase()
        
        return when (platform) {
            "YouTube" -> {
                if (urlLower.contains("/shorts") || urlLower.contains("/short")) "Shorts" 
                else "Videos"
            }
            "Instagram" -> {
                when {
                    urlLower.contains("/reel") || urlLower.contains("/reels") -> "Reels"
                    urlLower.contains("/stories") || urlLower.contains("/story") -> "Stories"
                    else -> "Posts"
                }
            }
            "Facebook" -> {
                when {
                    urlLower.contains("/reel") || urlLower.contains("/reels") -> "Reels"
                    urlLower.contains("/stories") || urlLower.contains("/story") -> "Stories"
                    else -> "Videos"
                }
            }
            "TikTok" -> "Videos"
            "Spotify", "SoundCloud" -> "Music"
            "Pinterest" -> "Pins"
            "X" -> "Posts"
            else -> "Downloads"
        }
    }

    private fun getOrganizedOutputDir(url: String): File {
        val platform = getPlatformName(url)
        val contentType = getContentType(url, platform)
        
        // Use app-specific external storage for Android 11+ compatibility
        // Path: /Android/data/com.vibedownloadermobile/files/vibedownloader/[Platform]/[ContentType]
        val baseDir = reactApplicationContext.getExternalFilesDir(null)
            ?: throw Exception("Cannot access app storage directory")
        val vibeDir = File(baseDir, "vibedownloader")
        val platformDir = File(vibeDir, platform)
        val typeDir = File(platformDir, contentType)
        
        if (!typeDir.exists()) typeDir.mkdirs()
        Log.d(TAG, "Download directory: ${typeDir.absolutePath}")
        return typeDir
    }

    private fun getAppOutputDir(): File {
        val baseDir = reactApplicationContext.getExternalFilesDir(null)
            ?: throw Exception("Cannot access storage directory")
        val vibeDir = File(baseDir, "vibedownloader")
        if (!vibeDir.exists()) vibeDir.mkdirs()
        return vibeDir
    }
    
    private fun scanMediaToGallery(file: File) {
        try {
            val mimeType = when {
                file.name.endsWith(".mp4") -> "video/mp4"
                file.name.endsWith(".webm") -> "video/webm"
                file.name.endsWith(".mkv") -> "video/x-matroska"
                file.name.endsWith(".mp3") -> "audio/mpeg"
                file.name.endsWith(".m4a") -> "audio/m4a"
                file.name.endsWith(".jpg") || file.name.endsWith(".jpeg") -> "image/jpeg"
                file.name.endsWith(".png") -> "image/png"
                file.name.endsWith(".webp") -> "image/webp"
                else -> null
            }
            
            if (mimeType != null) {
                android.media.MediaScannerConnection.scanFile(
                    reactApplicationContext,
                    arrayOf(file.absolutePath),
                    arrayOf(mimeType)
                ) { path, uri ->
                    Log.d(TAG, "Scanned to gallery: $path -> $uri")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to scan file to gallery: ${e.message}")
        }
    }

    // --- React Methods ---

    @ReactMethod
    fun getClipboardText(promise: Promise) {
        try {
            val clipboard = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = clipboard.primaryClip
            if (clip != null && clip.itemCount > 0) {
                promise.resolve(clip.getItemAt(0).text.toString())
            } else {
                promise.resolve("")
            }
        } catch (e: Exception) {
            promise.resolve("")
        }
    }

    @ReactMethod
    fun getVersions(promise: Promise) {
        scope.launch {
            try {
                val appVersion = reactApplicationContext.packageManager.getPackageInfo(reactApplicationContext.packageName, 0).versionName ?: "Unknown"
                val ytDlpVersion = YoutubeDL.getInstance().version(reactApplicationContext) ?: "Unknown"
                
                val result = WritableNativeMap().apply {
                    putString("appVersion", appVersion)
                    putString("ytdlpVersion", ytDlpVersion)
                }
                withContext(Dispatchers.Main) {
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("VERSIONS_ERROR", e.message ?: "Failed to get versions")
                }
            }
        }
    }

    @ReactMethod
    fun getSharedText(promise: Promise) {
        try {
            // First check MainActivity pending data
            val pendingUrl = com.vibedownloadermobile.MainActivity.pendingSharedUrl
            if (pendingUrl != null) {
                val url = pendingUrl
                // Clear pending data after reading
                com.vibedownloadermobile.MainActivity.pendingSharedUrl = null
                com.vibedownloadermobile.MainActivity.pendingPlatform = null
                promise.resolve(url)
                return
            }

            // Fallback to intent check
            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                promise.resolve(null)
                return
            }
            
            val intent = activity.intent
            val action = intent?.action
            val type = intent?.type

            if (Intent.ACTION_SEND == action && type != null) {
                if ("text/plain" == type) {
                    val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
                    // Clear the intent to prevent re-processing
                    intent.removeExtra(Intent.EXTRA_TEXT)
                    promise.resolve(sharedText)
                    return
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun getSharedData(promise: Promise) {
        try {
            val pendingUrl = com.vibedownloadermobile.MainActivity.pendingSharedUrl
            val pendingPlatform = com.vibedownloadermobile.MainActivity.pendingPlatform

            if (pendingUrl != null) {
                val result = WritableNativeMap().apply {
                    putString("url", pendingUrl)
                    putString("platform", pendingPlatform)
                    putBoolean("autoFetch", true)
                }
                // Clear pending data
                com.vibedownloadermobile.MainActivity.pendingSharedUrl = null
                com.vibedownloadermobile.MainActivity.pendingPlatform = null
                promise.resolve(result)
                return
            }

            // Fallback to intent
            val activity = reactApplicationContext.currentActivity
            if (activity != null) {
                val intent = activity.intent
                val action = intent?.action
                val type = intent?.type

                if (Intent.ACTION_SEND == action && type == "text/plain") {
                    val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
                    if (sharedText != null) {
                        val urlMatch = Regex("(https?://[^\\s]+)").find(sharedText)
                        val url = urlMatch?.value
                        if (url != null) {
                            val result = WritableNativeMap().apply {
                                putString("url", url)
                                putString("platform", getPlatformName(url))
                                putBoolean("autoFetch", true)
                            }
                            // Clear intent
                            intent.removeExtra(Intent.EXTRA_TEXT)
                            promise.resolve(result)
                            return
                        }
                    }
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun saveCookiesToFile(cookiesText: String, platform: String, promise: Promise) {
        try {
            val filesDir = reactApplicationContext.filesDir
            if (!filesDir.exists()) filesDir.mkdirs()

            val cookiesFile = File(filesDir, "cookies_$platform.txt")
            if (cookiesFile.exists()) {
                cookiesFile.delete() // Create fresh file to avoid permission/sandbox staleness after update
            }
            cookiesFile.writeText(cookiesText)

            Log.d(TAG, "Cookies saved to persistent storage: ${cookiesFile.absolutePath}")
            promise.resolve(cookiesFile.absolutePath)
        } catch (e: Exception) {
            promise.reject("COOKIE_SAVE_ERROR", "Failed to save cookies file", e)
        }
    }

    @ReactMethod
    fun getCookiesFilePath(platform: String, promise: Promise) {
        try {
            val cookiesFile = File(reactApplicationContext.filesDir, "cookies_$platform.txt")
            if (cookiesFile.exists()) {
                promise.resolve(cookiesFile.absolutePath)
            } else {
                promise.resolve(null)
            }
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun fileExists(path: String, promise: Promise) {
        promise.resolve(File(path).exists())
    }

    /**
     * Physically deletes the cookie .txt file at [path] from filesDir.
     * Called by the JS CookieManagerService on logout so stale session
     * tokens do not survive across app reinstalls / debug builds.
     */
    @ReactMethod
    fun deleteCookieFile(path: String, promise: Promise) {
        try {
            val file = File(path)
            val deleted = if (file.exists()) file.delete() else true
            Log.d(TAG, "deleteCookieFile: $path → deleted=$deleted")
            promise.resolve(deleted)
        } catch (e: Exception) {
            Log.w(TAG, "deleteCookieFile failed for $path: ${e.message}")
            promise.resolve(false) // non-fatal
        }
    }

    /**
     * Reads ALL cookies (including HttpOnly session cookies) for [url] directly
     * from the Android WebView CookieManager.
     *
     * android.webkit.CookieManager.getCookie(url) returns a flat cookie string:
     *   "name1=value1; name2=value2; ..."
     * This includes HttpOnly cookies that JavaScript / @react-native-cookies/cookies
     * cannot access, making it the most reliable extraction method on Android.
     *
     * Must be called on the main thread; we post to the main looper accordingly.
     */
    @ReactMethod
    fun getWebViewCookies(url: String, promise: Promise) {
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            try {
                val wvCm = android.webkit.CookieManager.getInstance()
                // Flush in-memory cookies to the persistent store before reading
                wvCm.flush()
                val rawCookies = wvCm.getCookie(url) ?: ""
                Log.d(TAG, "getWebViewCookies($url) → $rawCookies")
                promise.resolve(rawCookies)
            } catch (e: Exception) {
                Log.w(TAG, "getWebViewCookies failed for $url: ${e.message}")
                promise.resolve("")
            }
        }
    }

    @ReactMethod
    fun saveThumbnail(url: String, title: String, promise: Promise) {
        scope.launch {
            try {
                // Use Pictures directory
                val outputDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
                if (!outputDir.exists()) outputDir.mkdirs()

                val safeTitle = title.replace(Regex("[^a-zA-Z0-9.-]"), "_")
                val fileName = "Vibe_$safeTitle.jpg"
                val file = File(outputDir, fileName)

                val javaUrl = URL(url)
                val connection = javaUrl.openConnection()
                connection.connect()
                
                val input = BufferedInputStream(javaUrl.openStream())
                val output = FileOutputStream(file)
                
                val data = ByteArray(1024)
                var count: Int
                while (input.read(data).also { count = it } != -1) {
                    output.write(data, 0, count)
                }
                
                output.flush()
                output.close()
                input.close()

                // Scan to show in Gallery
                android.media.MediaScannerConnection.scanFile(
                    reactApplicationContext,
                    arrayOf(file.absolutePath),
                    arrayOf("image/jpeg"),
                    null
                )

                withContext(Dispatchers.Main) {
                    promise.resolve(file.absolutePath)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("SAVE_ERROR", e.message ?: "Failed to save thumbnail")
                }
            }
        }
    }

    /**
     * Downloads an image from [url] into the app's cache directory and returns
     * the absolute path to the local file. Used to pre-fetch high-res album art
     * (lh3.googleusercontent.com) so yt-dlp can embed it with --thumbnail.
     *
     * Saves to:  <cacheDir>/thumbnails/<md5(url)>.jpg
     */
    @ReactMethod
    fun downloadThumbnailToCache(url: String, promise: Promise) {
        scope.launch {
            try {
                val thumbDir = File(reactApplicationContext.cacheDir, "thumbnails")
                if (!thumbDir.exists()) thumbDir.mkdirs()

                // Stable filename derived from the URL so repeated calls are idempotent
                val hash = java.security.MessageDigest.getInstance("MD5")
                    .digest(url.toByteArray())
                    .joinToString("") { "%02x".format(it) }
                val thumbFile = File(thumbDir, "$hash.jpg")

                // Re-use cached file if already downloaded
                if (thumbFile.exists() && thumbFile.length() > 0) {
                    Log.d(TAG, "downloadThumbnailToCache: cache hit ${thumbFile.absolutePath}")
                    withContext(Dispatchers.Main) { promise.resolve(thumbFile.absolutePath) }
                    return@launch
                }

                val connection = java.net.URL(url).openConnection().apply {
                    setRequestProperty("User-Agent",
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                    connectTimeout = 15_000
                    readTimeout    = 15_000
                    connect()
                }

                BufferedInputStream(connection.getInputStream()).use { input ->
                    FileOutputStream(thumbFile).use { output ->
                        input.copyTo(output, bufferSize = 8192)
                    }
                }

                Log.d(TAG, "downloadThumbnailToCache: saved ${thumbFile.length()} bytes → ${thumbFile.absolutePath}")
                withContext(Dispatchers.Main) { promise.resolve(thumbFile.absolutePath) }
            } catch (e: Exception) {
                Log.w(TAG, "downloadThumbnailToCache failed: ${e.message}")
                withContext(Dispatchers.Main) {
                    promise.reject("THUMB_DOWNLOAD_ERROR", e.message ?: "Failed to download thumbnail")
                }
            }
        }
    }

    @ReactMethod
    fun fetchInfo(url: String, options: ReadableMap?, promise: Promise) {
        if (!isInitialized) initializeYtDlp()
        
        if (!isValidPlatform(url)) {
            promise.reject("PLATFORM_NOT_SUPPORTED", "This platform is not supported.")
            return
        }
        
        val startedAt = System.currentTimeMillis()
        scope.launch {
            try {
                val platform = getPlatformName(url)
                
                // Builds a fresh request. A retry needs its own YoutubeDLRequest
                // because options accumulate on the instance.
                fun buildRequest(playerClients: String?): YoutubeDLRequest {
                    val request = YoutubeDLRequest(url)
                    
                    // Network options to prevent DNS/IPv6 issues
                    request.addOption("--force-ipv4")
                    request.addOption("--no-check-certificate")
                    request.addOption("--socket-timeout", "30")

                    // External JS runtime (QuickJS) for YouTube n-sig — without this
                    // yt-dlp falls back to its pure-Python interpreter (~30-40s).
                    // Only YouTube needs it, and it is set once here rather than
                    // at each use site: --no-js-runtimes clears the defaults, so a
                    // second injection would reset the runtime chosen above.
                    if (platform == "YouTube") applyJsRuntime(request)
                    
                    // Use a standard Desktop User-Agent to bypass simple bot protections for TikTok, Instagram, etc.
                    // Note: Do not use --impersonate as it requires curl-cffi which isn't available on Android
                    request.addOption("--user-agent", DESKTOP_USER_AGENT)
                    
                    if (url.contains("instagram.com")) {
                        request.addOption("--referer", "https://www.instagram.com/")
                    }
                    
if (options?.hasKey("cookies") == true) {
  val cookiesPath = options.getString("cookies")
  if (!cookiesPath.isNullOrEmpty()) request.addOption("--cookies", cookiesPath)
}

  // Optional cap for recording a live broadcast. A live stream has no end, so
  // without this it records until the user cancels. This fetches only the
  // leading window rather than following the playlist forever, and needs ffmpeg
  // to cut the assembled stream (already guaranteed for Twitch).
  val maxDurationSeconds = if (options?.hasKey("maxDurationSeconds") == true) {
    options.getDouble("maxDurationSeconds")
  } else null
  if (maxDurationSeconds != null && maxDurationSeconds > 0 && maxDurationSeconds.isFinite()) {
    request.addOption("--download-sections", "*0-${fmtSec(maxDurationSeconds)}")
    request.addOption("--force-keyframes-at-cuts")
  }
                    
                    if (options?.hasKey("args") == true) {
                        val extraArgs = options.getArray("args")
                        if (extraArgs != null) {
                            for (i in 0 until extraArgs.size()) {
                                val arg = extraArgs.getString(i)
                                if (!arg.isNullOrEmpty()) request.addOption(arg)
                            }
                        }
                    }
                    
                    if (platform == "YouTube" && !playerClients.isNullOrEmpty()) {
                        request.addOption("--extractor-args", "youtube:player_client=$playerClients")
                    }
                    request.addOption("--no-playlist")
                    
                    // No -f selector here on purpose. Two reasons:
                    //
                    // 1. Robustness. A format selector that matches nothing aborts the
                    //    whole extraction with "Requested format is not available", so a
                    //    video whose best mp4/m4a pair is missing failed the entire
                    //    fetch rather than just degrading.
                    // 2. Correctness. yt-dlp filters `formats` down to the selector's
                    //    matches, so asking for one merged format here meant the
                    //    response only ever described that single format. FormatList
                    //    needs the full list, and per-language audio track discovery
                    //    reads the same array - a `-f` here hid every dubbed track.
                    //
                    // yt-dlp still picks a sensible default internally; it just no
                    // longer constrains what gets reported back.
                    
                    // yt-dlp's raw JSON is parsed here instead of through
                    // YoutubeDL.VideoInfo: that model drops the `subtitles` and
                    // `automatic_captions` dictionaries and the per-format
                    // `language` field, which are exactly what subtitle and
                    // multi-audio selection need. This is still the same single
                    // extraction getInfo() performed, so no extra request is made.
                    request.addOption("--dump-single-json")
                    
                    return request
                }
                
                // YouTube client preference order. `web_embedded` leads because it is the only
                // client that still returns direct https formats: the plain `web`
                // and `ios` clients are forced into SABR-only streaming, which
                // leaves yt-dlp with nothing but storyboard images and a hard
                // "Requested format is not available" for the whole extraction.
                // It also handles age restrictions without cookies, and
                // `tv_embedded` used to lead here but yt-dlp now reports it as an
                // unsupported client and skips it.
                //
                // Kept to two entries on purpose: every extra client costs a full
                // extraction (~17s each), and only `android` can still produce a
                // real format, so trying `web`/`ios` first just added dead time to
                // an already-failing fetch.
                val clientSets: List<String?> = if (platform == "YouTube") {
                    listOf("web_embedded", "android")
                } else {
                    listOf(null)
                }

                var responseJson: String? = null
                var lastError: Exception? = null
                // The client that actually produced the format list. Format ids are
                // client-specific, so the download has to reuse this exact client or
                // the id the user picked does not exist over there.
                var usedPlayerClient: String? = null

                for (clients in clientSets) {
                    try {
                        responseJson = YoutubeDL.getInstance()
                            .execute(buildRequest(clients), processId = null, callback = null)
                            .out
                        usedPlayerClient = clients
                        break
                    } catch (e: Exception) {
                        val message = e.message ?: ""
                        // Only a format-selection failure is worth another client;
                        // cookie, geo and rate-limit errors will just fail again.
                        if (!message.contains("Requested format is not available")) throw e
                        lastError = e
                        Log.w(TAG, "fetchInfo: player_client=$clients unusable, trying next")
                    }
                }

                if (responseJson == null) {
                    throw IllegalStateException(
                        explainFetchFailure(url, clientSets.first(), lastError?.message)
                    )
                }
                
                val raw = JsonParser.parseString(responseJson).asJsonObject
                val rawFormats = raw.get("formats")
                
                val result = WritableNativeMap().apply {
                    putString("id", raw.str("id"))
                    putString("title", raw.str("title").ifBlank { "Untitled" })
                    putString("description", raw.str("description"))
                    putString("uploader", raw.str("uploader").ifBlank { "Unknown" })
                    putString("uploaderUrl", "")
                    putDouble("duration", raw.num("duration") ?: 0.0)
                    putDouble("viewCount", raw.num("view_count") ?: 0.0)
                    putDouble("likeCount", raw.num("like_count") ?: 0.0)
                    putString("uploadDate", raw.str("upload_date"))
putString("extractor", raw.str("extractor"))
  putString("url", url)
  putString("platform", platform)
  // Handed back so download() can re-select the same client that produced
  // these format ids.
  putString("playerClient", usedPlayerClient)
  // Live broadcasts have no known duration (0 or absent) and report a
  // live_status. Twitch reports "is_live"; treat any non-"not_live"/absent
  // status as live so recording is not treated as an unbounded VOD.
  val liveStatus = raw.str("live_status")
  putBoolean("isLive", raw.bool("is_live") == true ||
    (liveStatus.isNotBlank() && liveStatus != "not_live" && liveStatus != "was_live"))
                    putString("ext", raw.str("ext").ifBlank { "mp4" })
                    putDouble("filesize", 0.0)
                    putString("resolution", "")
                    putInt("width", (raw.num("width") ?: 0.0).toInt())
                    putInt("height", (raw.num("height") ?: 0.0).toInt())
                    putDouble("fps", 0.0)
                    val rawCategories = raw.get("categories")
                    val categoriesArray = WritableNativeArray()
                    var hasMusicCat = false
                    if (rawCategories != null && rawCategories.isJsonArray) {
                        rawCategories.asJsonArray.forEach { cat ->
                            if (cat.isJsonPrimitive) {
                                val s = cat.asString
                                categoriesArray.pushString(s)
                                if (s.equals("Music", ignoreCase = true)) hasMusicCat = true
                            }
                        }
                    }
                    val uploaderStr = raw.str("uploader")
                    val rawArtist = raw.str("artist").ifBlank { raw.str("creator") }
                    val isMusicTrack = (platform == "YouTube" && (url.contains("music.youtube.com") || hasMusicCat || uploaderStr.endsWith("-Topic"))) || platform == "Spotify" || platform == "SoundCloud"

                    // Best Option: Look for square art from Google Content hosts (lh3/yt3.googleusercontent.com, ggpht.com)
                    // Exactly matching desktop infoHandler.ts lines 115-145
                    val rawThumbnails = raw.get("thumbnails")
                    var selectedThumb = raw.str("thumbnail")
                    if (rawThumbnails != null && rawThumbnails.isJsonArray) {
                        val thumbsList = rawThumbnails.asJsonArray
                        var googleArtUrl: String? = null
                        for (t in thumbsList) {
                            if (t.isJsonObject) {
                                val tUrl = t.asJsonObject.str("url")
                                if (tUrl.contains("googleusercontent.com") || tUrl.contains("ggpht.com")) {
                                    googleArtUrl = tUrl
                                    break
                                }
                            }
                        }
                        if (googleArtUrl != null) {
                            var highRes = googleArtUrl
                            if (highRes.contains("=w")) {
                                highRes = highRes.replace(Regex("=w\\d+.*$"), "=w2000-h2000-p-l90-rj")
                            } else if (!highRes.contains("=")) {
                                highRes += "=w2000-h2000-p-l90-rj"
                            }
                            selectedThumb = highRes
                            Log.d(TAG, "Selected premium Google square album art: $selectedThumb")
                        } else if (isMusicTrack || hasMusicCat) {
                            for (t in thumbsList) {
                                if (t.isJsonObject) {
                                    val obj = t.asJsonObject
                                    val w = obj.num("width") ?: 0.0
                                    val h = obj.num("height") ?: 0.0
                                    val tUrl = obj.str("url")
                                    if (w >= 300 && h > 0) {
                                        val ratio = w / h
                                        if (Math.abs(ratio - 1.0) < 0.05) {
                                            selectedThumb = tUrl.replace("/vi_webp/", "/vi/").replace(".webp", ".jpg")
                                            break
                                        }
                                    }
                                }
                            }
                        }
                    }

                    putString("thumbnail", selectedThumb)
                    putString("artist", rawArtist)
                    putString("track", raw.str("track"))
                    putBoolean("isMusic", isMusicTrack)
                    putArray("categories", categoriesArray)
                    
                    val formatsArray = WritableNativeArray()
                    if (rawFormats != null && rawFormats.isJsonArray) {
                        rawFormats.asJsonArray.forEach { element ->
                            if (!element.isJsonObject) return@forEach
                            val format = element.asJsonObject
                            
                            // Filter Logic
                            val vcodec = format.str("vcodec")
                            val acodec = format.str("acodec")
                            val isVideoFormat = vcodec.isNotBlank() && vcodec != "none"
                            val isAudioFormat = acodec.isNotBlank() && acodec != "none"
                            val ext = format.str("ext").lowercase()
                            
                            if (platform == "YouTube") {
                                if (ext != "mp4" && ext != "m4a" && ext != "webm") return@forEach
                            }
                            
                            val width = (format.num("width") ?: 0.0).toInt()
                            val height = (format.num("height") ?: 0.0).toInt()
                            val formatMap = WritableNativeMap().apply {
                                putString("formatId", format.str("format_id"))
                                putString("formatNote", format.str("format_note"))
                                putString("ext", format.str("ext"))
                                putDouble("filesize", format.num("filesize") ?: 0.0)
                                putDouble("tbr", format.num("tbr") ?: 0.0)
                                putInt("width", width)
                                putInt("height", height)
                                putString("resolution", "${width}x${height}")
                                putDouble("fps", format.num("fps") ?: 0.0)
                                putString("vcodec", vcodec)
                                putString("acodec", acodec)
                                putBoolean("hasVideo", isVideoFormat)
                                putBoolean("hasAudio", isAudioFormat)
                            }
                            formatsArray.pushMap(formatMap)
                        }
                    }
                    putArray("formats", formatsArray)
                    
                    // Caption tracks and per-language audio tracks, read from the
                    // unfiltered array because the format filter above is specific
                    // to what the picker displays.
                    val subtitlesArray = WritableNativeArray()
                    buildSubtitleTracks(raw).forEach { track ->
                        subtitlesArray.pushMap(WritableNativeMap().apply {
                            putString("key", track.key)
                            putString("lang", track.lang)
                            putString("label", track.label)
                            putString("langLabel", track.langLabel)
                            putBoolean("isAuto", track.isAuto)
                            putArray("formats", WritableNativeArray().apply {
                                track.formats.forEach { pushString(it) }
                            })
                        })
                    }
                    putArray("subtitles", subtitlesArray)
                    
                    val audioTracksArray = WritableNativeArray()
                    buildAudioTracks(rawFormats as? JsonArray).forEach { track ->
                        audioTracksArray.pushMap(WritableNativeMap().apply {
                            putString("key", track.key)
                            putString("lang", track.lang)
                            putString("langLabel", track.langLabel)
                            putBoolean("isOriginal", track.isOriginal)
                            putString("formatId", track.formatId)
                            putString("ext", track.ext)
                            putString("acodec", track.acodec)
                            putInt("abr", track.abr)
                        })
                    }
                    putArray("audioTracks", audioTracksArray)
                }
withContext(Dispatchers.Main) {
                    Log.d(
                        TAG,
                        "fetchInfo ok in ${System.currentTimeMillis() - startedAt}ms " +
                            "platform=$platform formats=${(rawFormats as? JsonArray)?.size() ?: 0}"
                    )
                    promise.resolve(result)
                }

            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("FETCH_ERROR", e.message ?: "Failed to fetch video info", e)
                }
            }
        }
    }

    /**
     * Metadata fast path. Resolves the same VideoInfo shape as [fetchInfo] but
     * through InnerTube instead of yt-dlp, which is roughly two orders of
     * magnitude faster because no Python or JS runtime is involved.
     *
     * Resolves with null when this path cannot serve the request, which is the
     * signal for the caller to fall back to [fetchInfo]. Deliberately never
     * rejects, so the JS side needs no try/catch to stay functional.
     *
     * The whole attempt is capped at [FAST_PATH_BUDGET_MS]. A fast path that
     * could hang would be slower than the ~15s yt-dlp path it replaces, so on
     * budget exhaustion it gives up immediately and yields to the fallback.
     */
    @ReactMethod
    fun fetchInfoFast(url: String, promise: Promise) {
        scope.launch {
            try {
                val videoId = InnerTubeResolver.extractVideoId(url)
                if (videoId == null) {
                    Log.d(TAG, "fast path not applicable: no video id in url")
                    withContext(Dispatchers.Main) { promise.resolve(null) }
                    return@launch
                }

                val info = withTimeoutOrNull(FAST_PATH_BUDGET_MS) {
                    InnerTubeResolver.resolve(reactApplicationContext, videoId)
                }
                if (info == null) {
                    Log.d(TAG, "fast path gave up or declined, deferring to yt-dlp")
                }
                withContext(Dispatchers.Main) {
                    if (info == null) promise.resolve(null) else promise.resolve(buildFastInfoMap(info, url))
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { promise.resolve(null) }
            }
        }
    }

    /** Mirrors the field names [fetchInfo] produces so the picker is unchanged. */
    private fun buildFastInfoMap(info: InnerTubeResolver.Info, url: String): WritableNativeMap {
        val thumbnails = InnerTubeResolver.bestThumbnail(info)

        return WritableNativeMap().apply {
            putString("id", info.id)
            putString("title", info.title)
            putString("description", "")
            putString("uploader", info.author)
            putString("uploaderUrl", "")
            putDouble("duration", info.durationSeconds)
            putDouble("viewCount", info.viewCount)
            putDouble("likeCount", 0.0)
            putString("uploadDate", "")
            putString("extractor", "youtube")
            putString("url", url)
            putString("platform", "YouTube")
            // Downloads re-run extraction through yt-dlp, so this must stay a client name
            // yt-dlp understands. The format ids below are InnerTube itags, which
            // are the same numbering yt-dlp reports, but the set is per-client, so
            // web_embedded is claimed for the download step.
            putString("playerClient", "web_embedded")
            putBoolean("isLive", info.isLive)
            putString("ext", "mp4")
            putDouble("filesize", 0.0)
            putString("resolution", "")
            putInt("width", 0)
            putInt("height", 0)
            putDouble("fps", 0.0)
            putString("thumbnail", thumbnails)
            putString("artist", "")
            putString("track", "")
            putBoolean("isMusic", false)
            putArray("categories", WritableNativeArray())

            putArray("formats", WritableNativeArray().apply {
                info.formats.forEach { format ->
                    pushMap(WritableNativeMap().apply {
                        putString("formatId", format.formatId)
                        putString("formatNote", format.formatNote)
                        putString("ext", format.ext)
                        putDouble("filesize", format.filesize)
                        putDouble("tbr", format.tbr)
                        putInt("width", format.width)
                        putInt("height", format.height)
                        putString("resolution", format.resolution)
                        putDouble("fps", format.fps)
                        putString("vcodec", format.vcodec)
                        putString("acodec", format.acodec)
                        putBoolean("hasVideo", format.hasVideo)
                        putBoolean("hasAudio", format.hasAudio)
                    })
                }
            })

            // Empty rather than absent: the picker hides these panels when the
            // arrays are present but empty.
            putArray("subtitles", WritableNativeArray().apply {
                info.subtitles.forEach { track ->
                    pushMap(WritableNativeMap().apply {
                        putString("key", track.key)
                        putString("lang", track.lang)
                        putString("label", track.label)
                        putString("langLabel", track.langLabel)
                        putBoolean("isAuto", track.isAuto)
                        putArray("formats", WritableNativeArray().apply {
                            track.formats.forEach { pushString(it) }
                        })
                    })
                }
            })

            putArray("audioTracks", WritableNativeArray().apply {
                info.audioTracks.forEach { track ->
                    pushMap(WritableNativeMap().apply {
                        putString("key", track.key)
                        putString("lang", track.lang)
                        putString("langLabel", track.langLabel)
                        putBoolean("isOriginal", track.isOriginal)
                        putString("formatId", track.formatId)
                        putString("ext", track.ext)
                        putString("acodec", track.acodec)
                        putInt("abr", track.abr)
                    })
                }
            })
        }
    }

    private fun subtitleMime(extension: String): String = when (extension.lowercase()) {
        "srt" -> "application/x-subrip"
        "vtt" -> "text/vtt"
        "ttml" -> "application/ttml+xml"
        else -> "text/plain"
    }

    /**
     * Downloads one caption track and publishes it to
     * `Download/VibeDownloader/<Platform>/Subtitles`.
     *
     * Resolves `{ filePath, fileName }` on success.
     */
    @ReactMethod
    fun downloadSubtitles(url: String, options: ReadableMap?, promise: Promise) {
        if (!isInitialized) initializeYtDlp()

        val lang = options?.takeIf { it.hasKey("lang") }?.getString("lang")
        if (lang.isNullOrBlank()) {
            promise.reject("SUBTITLE_NO_LANG", "No subtitle language was requested.")
            return
        }

        val isAuto = options?.takeIf { it.hasKey("isAuto") }?.getBoolean("isAuto") ?: false
        val format = options?.takeIf { it.hasKey("format") }?.getString("format") ?: "vtt"
        val platform = options?.takeIf { it.hasKey("platform") }?.getString("platform")
            ?.takeIf { it.isNotBlank() } ?: getPlatformName(url)
        val cookies = options?.takeIf { it.hasKey("cookies") }?.getString("cookies")
        val title = options?.takeIf { it.hasKey("title") }?.getString("title")

        scope.launch {
            val cacheDir = File(
                reactApplicationContext.cacheDir,
                "temp_subs_${System.currentTimeMillis()}"
            )
            var lastError = ""
            try {
                if (!cacheDir.exists() && !cacheDir.mkdirs()) {
                    throw Exception("Could not create cache directory")
                }

                val stem = safeFileStem(title ?: lang)
                val startedAt = System.currentTimeMillis()

                val request = YoutubeDLRequest(url)
                request.addOption("--skip-download")
                request.addOption("--no-warnings")
                request.addOption("--no-playlist")
                request.addOption(if (isAuto) "--write-auto-subs" else "--write-subs")
                request.addOption("--sub-langs", lang)
                request.addOption("--force-ipv4")
                request.addOption("--no-check-certificate")
                request.addOption("--socket-timeout", "30")
                request.addOption("--user-agent", DESKTOP_USER_AGENT)
                request.addOption("-o", "${cacheDir.absolutePath}/$stem.%(ext)s")
                applyJsRuntime(request)

                if (url.contains("instagram.com")) {
                    request.addOption("--referer", "https://www.instagram.com/")
                }
                if (!cookies.isNullOrEmpty()) {
                    request.addOption("--cookies", cookies)
                }

                if (format == "srt") {
                    // Accept whatever the track really publishes and let FFmpeg
                    // produce the srt. Asking for vtt alone fails on tracks that
                    // publish srt but not vtt.
                    request.addOption("--sub-format", "vtt/srt/best")
                    request.addOption("--convert-subs", "srt")
                } else {
                    request.addOption("--sub-format", "vtt")
                }

                var downloaded: File? = null
                for (attempt in 1..SUBTITLE_ATTEMPTS) {
                    try {
                        YoutubeDL.getInstance()
                            .execute(request, processId = null, callback = null)
                        lastError = ""
                    } catch (e: Exception) {
                        lastError = e.message ?: ""
                        if (attempt == SUBTITLE_ATTEMPTS) break
                        delay(SUBTITLE_RETRY_MS.toLong() * attempt)
                        continue
                    }

                    // yt-dlp exits 0 and writes nothing when it has no track for
                    // the requested language, so success cannot be read from the
                    // exit code. The timestamp guard stops a file left behind by
                    // an earlier attempt from passing for this one.
                    val freshFiles = cacheDir.listFiles()
                        ?.filter { it.isFile && it.lastModified() >= startedAt - 1000 }
                        ?: emptyList()
                    // yt-dlp writes <stem>.<lang>.<ext>; lang codes with script or
                    // region subtags (e.g. zh-Hans, en-US) appear verbatim, so match
                    // the expected prefix first and fall back to any fresh file.
                    downloaded = freshFiles.firstOrNull {
                        it.name.startsWith("$stem.$lang.") &&
                            it.extension.equals(format, ignoreCase = true)
                    } ?: freshFiles.firstOrNull {
                        it.name.startsWith("$stem.$lang.")
                    } ?: freshFiles.firstOrNull {
                        it.extension.equals(format, ignoreCase = true)
                    } ?: freshFiles.firstOrNull()

                    if (downloaded != null) break
                    if (attempt < SUBTITLE_ATTEMPTS) delay(SUBTITLE_RETRY_MS.toLong() * attempt)
                }

                val source = downloaded
                if (source == null) {
                    val message = when {
                        lastError.contains("429") ->
                            "YouTube is rate-limiting caption downloads. Wait about a minute and try again."
                        lastError.isNotBlank() -> "Could not download the $lang subtitles."
                        else -> "This video has no captions in \"$lang\"."
                    }
                    withContext(Dispatchers.Main) {
                        promise.reject("SUBTITLE_FAILED", message)
                    }
                    return@launch
                }

                val published = publishSidecarFile(source, platform, "Subtitles", subtitleMime(format))
                if (published == null) {
                    withContext(Dispatchers.Main) {
                        promise.reject(
                            "SUBTITLE_SAVE_FAILED",
                            "Downloaded the captions but could not save them to storage."
                        )
                    }
                    return@launch
                }

                withContext(Dispatchers.Main) {
                    promise.resolve(WritableNativeMap().apply {
                        putString("filePath", published)
                        putString("fileName", source.name)
                    })
                }
            } catch (e: Exception) {
                Log.e(TAG, "Subtitle download failed", e)
                withContext(Dispatchers.Main) {
                    promise.reject("SUBTITLE_ERROR", e.message ?: "Failed to download subtitles", e)
                }
            } finally {
                try { cacheDir.deleteRecursively() } catch (ignored: Exception) {}
            }
        }
    }

    /**
     * Writes a lyrics export to `Download/VibeDownloader/Lyrics`.
     *
     * Resolves `{ filePath, fileName }` on success.
     */
    @ReactMethod
    fun saveLyricsFile(fileName: String, content: String, platform: String?, promise: Promise) {
        scope.launch {
            var temp: File? = null
            try {
                val raw = fileName.trim()
                val extension = if (raw.endsWith(".lrc", ignoreCase = true)) "lrc" else "txt"
                val stem = safeFileStem(raw.substringBeforeLast('.').ifBlank { "lyrics" })
                val safeName = "$stem.$extension"

                temp = File.createTempFile("lyrics_", ".tmp", reactApplicationContext.cacheDir)
                temp.writeText(content)

                val published = publishSidecarFile(temp, platform, "Lyrics", "text/plain", displayName = safeName)
                if (published == null) {
                    withContext(Dispatchers.Main) {
                        promise.reject("LYRICS_SAVE_FAILED", "Could not save the lyrics file to storage.")
                    }
                    return@launch
                }

                withContext(Dispatchers.Main) {
                    promise.resolve(WritableNativeMap().apply {
                        putString("filePath", published)
                        putString("fileName", safeName)
                    })
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save lyrics file", e)
                withContext(Dispatchers.Main) {
                    promise.reject("LYRICS_SAVE_ERROR", e.message ?: "Failed to save lyrics", e)
                }
            } finally {
                try { temp?.delete() } catch (ignored: Exception) {}
            }
        }
    }

    /**
     * Copies a downloaded sidecar (captions, lyrics) into the public Downloads
     * tree, under `VibeDownloader/[platform/]subfolder`.
     *
     * Returns a filesystem path when one can be resolved so the Library screen
     * and `openFile` can address the file, otherwise the content Uri. The source
     * file is always consumed and removed.
     */
private fun publishSidecarFile(
        source: File,
        platform: String?,
        subfolder: String,
        mimeType: String,
        displayName: String? = null,
    ): String? = com.vibedownloadermobile.storage.MediaStorePublisher.publish(
        context = reactApplicationContext,
        source = source,
        platform = platform,
        subfolder = subfolder,
        mimeType = mimeType,
        displayName = displayName,
    )

    /**
     * Publishes a cover image into public storage.
     *
     * MediaStore refuses image files in the Music/ primary directory, so a cover
     * for a track that stayed m4a/webm cannot live beside the audio file. It goes
     * to Download/VibeDownloader/<platform>/Covers/ instead, which is the same
     * hardened publisher the lyrics/subtitle sidecars use.
     */
    private fun publishCoverImage(source: File, displayName: String, platform: String): Boolean {
        val published = publishSidecarFile(
            source = source,
            platform = platform,
            subfolder = "Covers",
            mimeType = "image/jpeg",
            displayName = displayName,
        )
        if (published == null) {
            Log.w(TAG, "Could not publish cover ${source.name}")
            return false
        }
        return true
    }

    private fun moveToPublicStorage(sourceFile: File, platform: String, contentType: String): File? {
        val extension = sourceFile.extension.lowercase()
        // webm/opus are ambiguous by extension: they carry both video-only and
        // audio-only streams. When the caller knows the item is audio, keep it in
        // Music instead of filing it under Movies.
        val callerSaysAudio = contentType.equals("Music", ignoreCase = true) ||
            contentType.equals("Audio", ignoreCase = true)
        val isVideo = listOf("mp4", "mkv", "webm", "mov", "avi", "flv").contains(extension) &&
            !(extension == "webm" && callerSaysAudio)
        val isAudio = listOf("mp3", "m4a", "wav", "aac", "flac", "ogg", "opus").contains(extension) ||
            (extension == "webm" && callerSaysAudio)
        val isImage = listOf("jpg", "png", "webp", "jpeg").contains(extension)
        
        // Use proper directories based on file type for better gallery integration
        val relativePath = when {
            isAudio -> "Music/VibeDownloader/$platform"
            isVideo -> "Movies/VibeDownloader/$platform/$contentType"
            isImage -> "Pictures/VibeDownloader/$platform/$contentType"
            else -> "Download/VibeDownloader/$platform"
        }
        
        val mimeType = when(extension) {
            "mp4" -> "video/mp4"
"mkv" -> "video/x-matroska"
        // MediaStore has no audio/webm MIME type, so audio-only webm is published
        // with the container's real type instead.
        "webm" -> "video/webm"
        "mov" -> "video/quicktime"
        "avi" -> "video/x-msvideo"
        "flv" -> "video/x-flv"
        "mp3" -> "audio/mpeg"
        "m4a" -> "audio/mp4"
        "aac" -> "audio/aac"
        "wav" -> "audio/wav"
        "flac" -> "audio/flac"
        "ogg" -> "audio/ogg"
        "opus" -> "audio/ogg"

            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "webp" -> "image/webp"
            else -> "*/*"
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = android.content.ContentValues().apply {
                put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, sourceFile.name)
                put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mimeType)
                put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
                put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)
            }

            val resolver = reactApplicationContext.contentResolver

            // MediaProvider validates MIME types against a fixed table and *throws*
            // IllegalArgumentException for anything it does not know (e.g. audio-only
            // webm). Without ffmpeg we now keep whatever container the source stream
            // had, so an unrecognised one must not abort an otherwise good download.
            val primaryCollection = when {
                isVideo -> android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                isAudio -> android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                isImage -> android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                else -> android.provider.MediaStore.Files.getContentUri("external")
            }
            val genericCollection = android.provider.MediaStore.Files.getContentUri("external")

            fun newValues(mime: String, path: String) = android.content.ContentValues().apply {
                put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, sourceFile.name)
                put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mime)
                put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, path)
                put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)
            }

            fun tryInsert(collection: android.net.Uri, mime: String, path: String): android.net.Uri? =
                try {
                    resolver.insert(collection, newValues(mime, path))
                } catch (e: Exception) {
                    Log.w(TAG, "MediaStore rejected $mime in $collection: ${e.message}")
                    null
                }

            var uri = tryInsert(primaryCollection, mimeType, relativePath)
            // The generic Files collection only accepts Download/Documents, so an
            // audio container MediaStore has no MIME for lands there instead.
            val genericPath = if (relativePath.startsWith("Download/")) relativePath
                else "Download/VibeDownloader/$platform"
            var insertedPath = relativePath
            if (uri == null && primaryCollection != genericCollection) {
                Log.w(TAG, "Retrying ${sourceFile.name} in the generic MediaStore collection")
                uri = tryInsert(genericCollection, mimeType, genericPath)
                insertedPath = genericPath
            }
            if (uri == null) {
                uri = tryInsert(genericCollection, "application/octet-stream", genericPath)
                insertedPath = genericPath
            }
            if (uri == null) return null
            values.clear()
            values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mimeType)
            values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, insertedPath)
            values.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)

            return try {
                resolver.openOutputStream(uri)?.use { output ->
                    java.io.FileInputStream(sourceFile).use { input ->
                        input.copyTo(output)
                    }
                }
                
                values.clear()
                values.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                
                // Delete source 
                sourceFile.delete()
                
                // Get the actual physical path from MediaStore for reliable deletion later
                var finalPath = sourceFile.absolutePath // last resort fallback
                val projection = arrayOf(android.provider.MediaStore.MediaColumns.DATA)
                resolver.query(uri, projection, null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val dataIndex = cursor.getColumnIndexOrThrow(android.provider.MediaStore.MediaColumns.DATA)
                        finalPath = cursor.getString(dataIndex)
                    }
                }
                File(finalPath)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to move file to MediaStore", e)
                resolver.delete(uri, null, null)
                null
            }
        } else {
            // Legacy implementation for Android 9 and below
            val publicDir = when {
                isAudio -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC)
                isImage -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)
                else -> Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
            }
            val targetDir = if (isAudio) {
                File(publicDir, "VibeDownloader/$platform")
            } else {
                File(publicDir, "VibeDownloader/$platform/$contentType")
            }
            if (!targetDir.exists()) targetDir.mkdirs()
            
            // Handle naming collisions
            var targetFile = File(targetDir, sourceFile.name)
            var count = 1
            val name = sourceFile.nameWithoutExtension
            val ext = sourceFile.extension
            while (targetFile.exists()) {
                targetFile = File(targetDir, "$name ($count).$ext")
                count++
            }
            
            return try {
                sourceFile.copyTo(targetFile, overwrite = true)
                sourceFile.delete()
                
                // Scan to show in Gallery
                android.media.MediaScannerConnection.scanFile(
                    reactApplicationContext,
                    arrayOf(targetFile.absolutePath),
                    arrayOf(mimeType), 
                    null
                )
                targetFile
            } catch (e: Exception) {
                Log.e(TAG, "Failed to move file (Legacy)", e)
                null
            }
        }
    }

    @ReactMethod
    fun getPlaylistInfo(url: String, options: ReadableMap?, promise: Promise) {
        scope.launch {
            try {
                if (!isInitialized) initializeYtDlp()

                val request = YoutubeDLRequest(url)
                request.addOption("--dump-single-json")

                // For Instagram/Facebook story URLs, do NOT use --flat-playlist:
                // flat-playlist returns incomplete/relative URLs for story entries.
                // We need full info (real video URL + thumbnail) per story item.
                val isStoryUrl = url.contains("/stories/") ||
                    url.contains("facebook.com") && url.contains("/stories")
                if (!isStoryUrl) {
                    request.addOption("--flat-playlist")
                }

                request.addOption("--force-ipv4")
                request.addOption("--no-check-certificate")
                // Longer timeout for stories (multiple entries to resolve)
                request.addOption("--socket-timeout", if (isStoryUrl) "45" else "30")
                request.addOption("--user-agent", DESKTOP_USER_AGENT)
                applyJsRuntime(request)
                request.addOption("--no-warnings")
                
                if (url.contains("instagram.com")) {
                    request.addOption("--referer", "https://www.instagram.com/")
                }

                if (options?.hasKey("cookies") == true) {
                    val cookiesPath = options.getString("cookies")
                    if (!cookiesPath.isNullOrEmpty()) request.addOption("--cookies", cookiesPath)
                }

                if (options?.hasKey("extractorArgs") == true) {
                    val args = options.getString("extractorArgs")
                    if (!args.isNullOrEmpty()) request.addOption("--extractor-args", args)
                }

                if (options?.hasKey("args") == true) {
                    val extraArgs = options.getArray("args")
                    if (extraArgs != null) {
                        for (i in 0 until extraArgs.size()) {
                            val arg = extraArgs.getString(i)
                            if (!arg.isNullOrEmpty()) {
                                // Add individual option. Note: this expects a full option like "--no-warnings"
                                request.addOption(arg)
                            }
                        }
                    }
                }

                val response = YoutubeDL.getInstance().execute(request)
                promise.resolve(response.out)
            } catch (e: Exception) {
                 promise.reject("PLAYLIST_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun download(url: String, formatId: String?, processId: String, options: ReadableMap?, promise: Promise) {
        if (!isInitialized) initializeYtDlp()
        
        if (!isValidPlatform(url)) {
            promise.reject("PLATFORM_NOT_SUPPORTED", "This platform is not supported.")
            return
        }
        
        val isCancelled = AtomicBoolean(false)
        activeDownloads[processId] = isCancelled
        updateServiceState()
        
        scope.launch {
            try {
                // Extract options for custom metadata and naming
                val forcedTitle          = if (options?.hasKey("title")         == true) options.getString("title")         else null
                val forcedArtist         = if (options?.hasKey("artist")        == true) options.getString("artist")        else null
                val forcedPlatform       = if (options?.hasKey("platform")      == true) options.getString("platform")      else null
                // YouTube format ids only mean anything for the player client that
                // produced them. fetchInfo reports which client won, because
                // web_embedded often fails and the list then comes from android -
                // asking for web_embedded here would make every id unavailable.
                val requestedPlayerClient = if (options?.hasKey("playerClient") == true) {
                    options.getString("playerClient")
                } else null
                // Optional path to a pre-downloaded high-res album art file.
                // When set, yt-dlp uses this file as the embedded thumbnail instead
                // of fetching whatever thumbnail is linked in the video metadata.
                val overrideThumbnailPath = if (options?.hasKey("thumbnailPath") == true) options.getString("thumbnailPath") else null
                
                // Optional per-language audio format id from the Audio Language
                // picker. A dubbed video publishes one audio format set per
                // language, and pinning the chosen id is what makes the download
                // use that language instead of YouTube's default track.
                val audioFormatId = if (options?.hasKey("audioFormatId") == true) {
                    options.getString("audioFormatId")
                } else {
                    null
                }?.takeIf { it.isNotBlank() }

                // Optional clip range in seconds, from the Cut & Download sheet.
                // Cutting is a post-process, so this is deliberately NOT passed to
                // yt-dlp as --download-sections: that would download only the
                // requested range and skip the direct-CDN fast path entirely.
                // Both bounds must be present and ordered, otherwise no cut runs.
                val requestedCutStart = if (options?.hasKey("cutStart") == true) {
                    if (options.getType("cutStart") == ReadableType.Number) options.getDouble("cutStart") else null
                } else null
                val requestedCutEnd = if (options?.hasKey("cutEnd") == true) {
                    if (options.getType("cutEnd") == ReadableType.Number) options.getDouble("cutEnd") else null
                } else null
val isCutDownload = requestedCutStart != null && requestedCutEnd != null &&
      requestedCutEnd > requestedCutStart

                // Live recording options. yt-dlp follows a live stream until it ends;
                // an optional cap is enforced by ffmpeg so the recording stops cleanly.
                val isLiveDownload = options?.hasKey("isLive") == true &&
                    options.getType("isLive") == ReadableType.Boolean &&
                    options.getBoolean("isLive")
                val maxLiveDuration = if (options?.hasKey("maxDurationSeconds") == true &&
                    options.getType("maxDurationSeconds") == ReadableType.Number) {
                    options.getDouble("maxDurationSeconds").takeIf { it > 0 }
                } else null
                
                // Determine platform (use forced if provided, e.g. for Spotify lossless)
                val platform = forcedPlatform ?: getPlatformName(url)
                
                // 1. Download to temp cache directory first
                val cacheDir = File(reactApplicationContext.cacheDir, "temp_download_$processId")
                if (!cacheDir.exists()) cacheDir.mkdirs()
                
                Log.d(TAG, "Starting download to cache: ${cacheDir.absolutePath}")

                val request = YoutubeDLRequest(url)

                // External JS runtime for YouTube challenges (same as fetchInfo)
                applyJsRuntime(request)
                
                if (options?.hasKey("cookies") == true) {
                    val cookiesPath = options.getString("cookies")
                    if (!cookiesPath.isNullOrEmpty()) request.addOption("--cookies", cookiesPath)
                }
                
                // --- Output Filename Template ---
                // If title is provided, use it to avoid placeholder "0 [0]" for direct CDN links
                val outputTemplate = if (!forcedTitle.isNullOrEmpty()) {
                    val safeTitle = forcedTitle.replace(Regex("[^a-zA-Z0-9 \\-_]"), "_").take(80)
                    val safeArtist = forcedArtist?.replace(Regex("[^a-zA-Z0-9 \\-_]"), "_")?.take(40)
                    
                    if (!safeArtist.isNullOrEmpty()) {
                        request.addOption("--metadata-from-title", "%(artist)s - %(title)s")
                        val baseName = "$safeArtist - $safeTitle"
                        
                        // Seed the custom thumbnail so yt-dlp embeds it
                        if (overrideThumbnailPath != null) {
                            val targetThumb = File(cacheDir, "$baseName.jpg")
                            try { File(overrideThumbnailPath).copyTo(targetThumb, overwrite = true) } catch (e: Exception) {}
                        }
                        
                        "${cacheDir.absolutePath}/$baseName.%(ext)s"
                    } else {
                        request.addOption("--metadata-from-title", "%(title)s")
                        val baseName = safeTitle
                        
                        if (overrideThumbnailPath != null) {
                            val targetThumb = File(cacheDir, "$baseName.jpg")
                            try { File(overrideThumbnailPath).copyTo(targetThumb, overwrite = true) } catch (e: Exception) {}
                        }
                        
                        "${cacheDir.absolutePath}/$baseName.%(ext)s"
                    }
                } else {
                    // Standard yt-dlp template - using [id] to ensure uniqueness
                    request.addOption("--restrict-filenames")
                    "${cacheDir.absolutePath}/%(title).100s [%(id)s].%(ext)s"
                }
                
                request.addOption("-o", outputTemplate)
                request.addOption("--no-playlist")
                
                request.addOption("--user-agent", DESKTOP_USER_AGENT)
                
                if (url.contains("instagram.com")) {
                    request.addOption("--referer", "https://www.instagram.com/")
                }
                
                // --- Format and Codec Selection ---
                val isAudioDownload = formatId?.startsWith("audio") == true || formatId == "audio_best" || formatId == "audio_mp3"

                val ffmpegLoc = getFFmpegLocation()
                if (ffmpegLoc != null) {
                    request.addOption("--ffmpeg-location", ffmpegLoc)
                }
                val ffmpegAvailable = ffmpegLoc != null && isFfmpegAvailable()
                if (!ffmpegAvailable) {
                    Log.w(TAG, "Downloading without postprocessing: bundled ffmpeg cannot run here")
                }

                // Twitch is the one platform that cannot degrade gracefully
                // without ffmpeg: every VOD and clip is DASH with separate
                // video-only and audio-only tracks, and there is no progressive
                // fallback to take instead. Without a merge the user would get a
                // video file with no sound that looks like a successful download,
                // so refuse up front instead.
                // `platform` can arrive from JS as either "Twitch" or "twitch",
                // so compare case-insensitively; otherwise the ffmpeg guard below
                // silently gets skipped and Twitch returns a video with no sound.
                val isTwitch = platform.equals("Twitch", ignoreCase = true)
                if (isTwitch && !ffmpegAvailable) {
                    Log.e(TAG, "Twitch needs ffmpeg to merge its separate audio/video tracks")
                    promise.reject(
"FFMPEG_REQUIRED",
                    "Twitch videos are split into separate audio and video streams, which must be merged. " +
                        "This app already includes ffmpeg for that, but it cannot start on this device."
                    )
                    activeDownloads.remove(processId)
                    updateServiceState()
                    return@launch
                }

                if (isLiveDownload) {
                    if (!ffmpegAvailable) {
                        promise.reject(
                            "FFMPEG_REQUIRED",
                            "Live recording needs ffmpeg to merge the live video and audio streams on this device."
                        )
                        activeDownloads.remove(processId)
                        updateServiceState()
                        return@launch
                    }
                    // Live broadcasts use separate video/audio streams. Let yt-dlp
                    // choose the best live representation and mux it to MP4.
                    request.addOption("-f", "bestvideo+bestaudio/best")
                    request.addOption("--merge-output-format", "mp4")
                    if (maxLiveDuration != null) {
                        request.addOption("--downloader", "ffmpeg")
                        request.addOption(
                            "--downloader-args",
                            "ffmpeg_i:-t ${fmtSec(maxLiveDuration)}"
                        )
                    }
                } else if (!formatId.isNullOrEmpty()) {
                     if (!ffmpegAvailable) {
                        // No ffmpeg means no transcoding and no muxing, so take the
                        // source streams as they are. Transcoding is dropped rather
                        // than failing, and DASH video-only formats cannot be paired
                        // with audio, so ask for a progressive file instead.
                        if (isAudioDownload) {
                            // Keep an explicitly chosen language track, otherwise
                            // prefer m4a so MediaStore accepts the MIME type.
                            request.addOption(
                                "-f",
                                audioFormatId ?: "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best"
                            )
                        } else {
                            // formatId is intentionally not honoured here: without
                            // ffmpeg a DASH video-only stream cannot be paired with
                            // audio, so requesting it would silently save a file with
                            // no sound. A progressive stream is the honest result.
                            Log.w(TAG, "No ffmpeg: ignoring format $formatId and taking a progressive stream instead")
                            request.addOption("-f", "best[ext=mp4]/best")
                        }
                    } else {
                     when {
                        formatId == "audio_wav" -> {
                            if (audioFormatId != null) request.addOption("-f", audioFormatId)
                            request.addOption("-x")
                            request.addOption("--audio-format", "wav")
                        }
                        formatId == "audio_best" || formatId == "audio_mp3" -> {
                            // Source the chosen language before converting. -x and
                            // --audio-format still run, so the output stays mp3.
                            if (audioFormatId != null) request.addOption("-f", audioFormatId)
                            request.addOption("-x")
                            request.addOption("--audio-format", "mp3")
                            request.addOption("--audio-quality", "0")
                        }
                        formatId == "audio_standard" -> {
                            if (audioFormatId != null) request.addOption("-f", audioFormatId)
                            request.addOption("-x")
                            request.addOption("--audio-format", "mp3")
                            request.addOption("--audio-quality", "5")
                        }
                        formatId == "audio_low" -> {
                            if (audioFormatId != null) request.addOption("-f", audioFormatId)
                            request.addOption("-x")
                            request.addOption("--audio-format", "mp3")
                            request.addOption("--audio-quality", "9")
                        }
                        formatId.startsWith("audio") -> {
                            if (audioFormatId != null) request.addOption("-f", audioFormatId)
                            request.addOption("-x")
                            request.addOption("--audio-format", "mp3")
                        }
else -> {
      // Video format - ensure MP4 container
      if (url.contains("youtube.com") || url.contains("youtu.be")) {
        // Reuse the client that produced the format list. Defaulting to
        // web_embedded is only right when that client is also the one that
        // answered fetchInfo; when fetchInfo fell back to android, every id
        // here is rejected with "Requested format is not available".
        val playerClient = requestedPlayerClient?.takeIf { it.isNotBlank() } ?: "web_embedded"
        request.addOption("--extractor-args", "youtube:player_client=$playerClient")
        applyJsRuntime(request)
      }
      if (isTwitch) {
        // Twitch quality ids are bare names ("1080p60", "720p60", "audio_only")
        // and there is no per-language audio track to honour, so pair the chosen
        // rung with the single audio track and merge the two.
        request.addOption("-f", "$formatId+bestaudio/best")
      } else {
        // Pair the chosen video with the chosen audio language;
        // plain bestaudio would hand back the original track.
        request.addOption("-f", "$formatId+${audioFormatId ?: "bestaudio"}/best")
      }
      request.addOption("--merge-output-format", "mp4")
   }
 }
 }
} else {
                    // Smart defaults based on platform. Twitch is matched on the
                    // case-insensitive `isTwitch` flag rather than as a `when`
                    // label so a lowercase "twitch" from JS still merges.
                    when {
                        isTwitch -> {
                            // Twitch has no progressive stream: the best video and
                            // the audio track are always separate DASH streams, so
                            // both must be requested and merged. The no-ffmpeg case
                            // already rejected above, so this always merges.
                            request.addOption("-f", "bestvideo+bestaudio/best")
                            request.addOption("--merge-output-format", "mp4")
                        }
                        platform.equals("YouTube", ignoreCase = true) -> {
                            // tv_embedded is skipped by yt-dlp and web is SABR-only,
                            // so web_embedded is the client that still resolves streams.
                            request.addOption("--extractor-args", "youtube:player_client=web_embedded")
                            applyJsRuntime(request)
                            if (ffmpegAvailable) {
                                request.addOption("-f", "bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio/best[ext=mp4]/best")
                                request.addOption("--merge-output-format", "mp4")
                            } else {
                                // Progressive files carry video+audio already, so
                                // they save without an ffmpeg merge.
                                request.addOption("-f", "best[ext=mp4]/best")
                            }
                        }
platform.equals("Spotify", ignoreCase = true) ||
                            platform.equals("SoundCloud", ignoreCase = true) -> {
    if (ffmpegAvailable) {
      request.addOption("-x")
      request.addOption("--audio-format", "mp3")
      request.addOption("--audio-quality", "0")
    } else {
      request.addOption("-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best")
    }
   }
                        else -> {
                            request.addOption("-f", "best[ext=mp4]/best")
                            if (ffmpegAvailable) {
                                request.addOption("--merge-output-format", "mp4")
                            }
                        }
                    }
                }
                
                // Everything below is postprocessing: tag embedding, thumbnail conversion,
                // stream muxing and audio transcoding all shell out to ffmpeg. On
                // devices whose page size the bundled ffmpeg cannot load, yt-dlp
                // aborts the whole download with "ffprobe and ffmpeg not found",
                // so request the untouched source instead.
                if (ffmpegAvailable) {
                    request.addOption("--embed-metadata")
                    if (isAudioDownload) {
                        // Embed thumbnail directly into MP3/M4A ID3 tags so music players show cover art
                        request.addOption("--embed-thumbnail")
                        if (overrideThumbnailPath != null) {
                            // Crux of the fix: forcefully stop yt-dlp from downloading its own 16:9 thumbnail
                            // so it's forced to use the 1:1 high-res art we just seeded manually.
                            request.addOption("--no-write-thumbnail")
                        } else {
                            request.addOption("--write-thumbnail")
                            request.addOption("--convert-thumbnails", "jpg")
                        }
                    } else {
                        // For video, write thumbnail as sidecar (embedding into video is slow)
                        if (overrideThumbnailPath == null) {
                            request.addOption("--write-thumbnail")
                            request.addOption("--convert-thumbnails", "jpg")
                        }
                    }
                } else {
                    // --write-thumbnail only saves the image file next to the media; it
                    // is --convert-thumbnails that needs ffmpeg. Writing the raw
                    // thumbnail still gives us artwork to embed with JAudioTagger, so
                    // every platform gets cover art even without ffmpeg.
                    if (overrideThumbnailPath == null) {
                        request.addOption("--write-thumbnail")
                    }
                    Log.w(TAG, "ffmpeg unavailable: keeping the source stream, embedding art with JAudioTagger where possible")
                }
                request.addOption("--no-post-overwrites")
                
                // Use a standard Desktop User-Agent to bypass simple bot protections for TikTok, Instagram, etc.
                // Note: Do not use --impersonate as it requires curl-cffi which isn't available on Android
                request.addOption("--user-agent", DESKTOP_USER_AGENT)
                
                request.addOption("--force-ipv4")
                request.addOption("--no-check-certificate")
                request.addOption("--socket-timeout", "30")
                
                val response = YoutubeDL.getInstance().execute(request, processId) { progress, eta, line ->
                    if (isCancelled.get()) return@execute
                    
                    val displayLine = when {
                        line.isNullOrEmpty() -> "Preparing..."
                        line.contains("Solving", ignoreCase = true) -> "Preparing..."
                        line.contains("Downloading", ignoreCase = true) && progress > 0 -> "${progress.toInt()}% - Downloading..."
                        line.contains("Merging", ignoreCase = true) -> "Finalizing..."
                        line.contains("Converting", ignoreCase = true) -> "Converting..."
                        line.contains("ffmpeg", ignoreCase = true) -> "Processing..."
                        else -> line.take(50).let { if (it.length < line.length) "$it..." else it }
                    }
                    
                    val params = WritableNativeMap().apply {
                        putString("processId", processId)
                        putDouble("progress", progress.toDouble())
                        putDouble("eta", eta.toDouble())
                        putString("line", displayLine)
                    }
                    sendEvent("onDownloadProgress", params)
                    
                    // Native notification progress
                    val titleText = forcedTitle ?: "Downloading..."
                    showProgressNotification(processId, titleText, progress.toInt(), displayLine)
                }
                
                cancelNotification(processId)
                activeDownloads.remove(processId)
                updateServiceState()
                
                if (isCancelled.get()) {
                    cacheDir.deleteRecursively()
                    withContext(Dispatchers.Main) { promise.reject("CANCELLED", "Download was cancelled") }
                    return@launch
                }
                
                // Scan cache for output file.
                // Instagram/Facebook stories can be image-only (jpg/webp) — handle both cases:
                //   1. First look for a proper video/audio file
                //   2. If none found (image story), fall back to the image file
                val recentCutoff = System.currentTimeMillis() - 10 * 60 * 1000
                val allRecentFiles = cacheDir.listFiles()
                    ?.filter { it.isFile && it.lastModified() > recentCutoff }
                    ?: emptyList()

                val mediaFile = allRecentFiles
                    .filter { !it.name.endsWith(".jpg") && !it.name.endsWith(".webp") && !it.name.endsWith(".png") }
                    .maxByOrNull { it.lastModified() }

                // Fall back to image if no video/audio was produced (e.g. image story)
                val downloadedFile = mediaFile
                    ?: allRecentFiles
                        .filter { it.name.endsWith(".jpg") || it.name.endsWith(".webp") || it.name.endsWith(".png") }
                        .maxByOrNull { it.lastModified() }
                    
                if (downloadedFile != null && downloadedFile.exists()) {
                    var finalProcessingFile = downloadedFile

                    val baseName = downloadedFile.nameWithoutExtension
                    val thumbFile = cacheDir.listFiles()?.find {
                        (it.nameWithoutExtension == baseName || it.nameWithoutExtension == "$baseName.thumbnail") &&
                        (it.extension == "jpg" || it.extension == "webp" || it.extension == "png")
                    }

                    // Prepare the physical thumbnail file to preserve
                    var finalThumbFile: File? = null
                    val overrideThumb = if (!overrideThumbnailPath.isNullOrEmpty()) File(overrideThumbnailPath) else null

                    if (overrideThumb != null && overrideThumb.exists()) {
                        finalThumbFile = overrideThumb
                    } else if (thumbFile != null && thumbFile.exists()) {
                        finalThumbFile = thumbFile
                    }

                    // --- Album Art Embedding (JAudioTagger) ---
                    // Pure-Java tagging, so it works with no ffmpeg at all. The art
                    // comes from the override when the caller supplied one (YouTube
                    // Music / Spotify high-res) and otherwise from the sidecar
                    // thumbnail yt-dlp just wrote, so every platform gets cover art.
                    var artEmbedded = false
                    if (finalThumbFile != null && finalThumbFile.exists()) {
                        val ext = downloadedFile.extension.lowercase()
                        when {
                            ext == "wav" -> {
                                // WAV artwork is not wanted and the format has no
                                // standard artwork frame.
                                Log.d(TAG, "Skipping album art for wav")
                            }
                            ext == "mp3" || ext == "aiff" -> {
                                try {
                                    Log.d(TAG, "Embedding album art into $ext via JAudioTagger...")
                                    // JAudioTagger requires the file to not be read-only
                                    downloadedFile.setWritable(true)
                                    val audioFile = AudioFileIO.read(downloadedFile)
                                    val tag = audioFile.tagOrCreateAndSetDefault
                                    val artwork = ArtworkFactory.createArtworkFromFile(finalThumbFile)
                                    // Clear any existing artwork first so we don't stack thumbnails
                                    tag.deleteArtworkField()
                                    tag.setField(artwork)
                                    audioFile.commit()
                                    artEmbedded = true
                                    Log.d(TAG, "Album art embedded successfully via JAudioTagger")
                                } catch (fe: Exception) {
                                    // Non-fatal: the sidecar copy is still published below.
                                    Log.w(TAG, "JAudioTagger artwork embedding failed (non-fatal): ${fe.message}")
                                }
                            }
                            else -> {
                                // jaudiotagger has no MP4 "covr" atom support, so artwork can
                                // only be attached to m4a/webm with ffmpeg. The sidecar cover
                                // image below is what Library and players pick up instead.
                                Log.d(TAG, "Container .$ext cannot hold embedded art without ffmpeg; keeping a sidecar cover")
                            }
                        }
                    }

                    // --- Clip cut (Cut & Download) ---
                    // Runs after the download and any album-art work so the cut
                    // keeps the finished container, and before publishing so only
                    // the trimmed file ever reaches MediaStore. A failure keeps the
                    // full-length file and flags the result instead of discarding a
                    // download the user already paid for.
                    var cutApplied = false
                    if (isCutDownload) {
                        val cutStartSec = requestedCutStart!!
                        val cutEndSec = requestedCutEnd!!
                        if (isCancelled.get()) {
                            cacheDir.deleteRecursively()
                            withContext(Dispatchers.Main) { promise.reject("CANCELLED", "Download was cancelled") }
                            return@launch
                        }
                        if (!isFfmpegAvailable()) {
                            Log.w(TAG, "Cut requested but ffmpeg cannot run on this device; keeping full file")
                        } else {
                            val cutParams = WritableNativeMap().apply {
                                putString("processId", processId)
                                putDouble("progress", 95.0)
                                putDouble("eta", 0.0)
                                putString("line", "Cutting segment...")
                            }
                            sendEvent("onDownloadProgress", cutParams)
                            showProgressNotification(
                                processId,
                                forcedTitle ?: "Cutting segment...",
                                95,
                                "Cutting segment..."
                            )

                            val cutFile = cutMediaFile(
                                finalProcessingFile,
                                cutStartSec,
                                cutEndSec,
                                processId,
                                isCancelled
                            )
                            if (cutFile != null) {
                                cutApplied = true
                                // The range is already in the cut filename; drop the
                                // full-length original now that it is superseded.
                                try { finalProcessingFile.delete() } catch (e: Exception) {}
                                finalProcessingFile = cutFile
                                Log.d(TAG, "Cut saved: ${cutFile.name}")
                            }
                        }
                    }

                    // Move to public storage with proper categorization
                    val contentType = getContentType(url, platform)
                    val finalFile = moveToPublicStorage(finalProcessingFile, platform, contentType)
                    
                    // Preserve thumbnail to public Music folder (as per user request)
                    // and also to internal app thumbnails cache
                    if (finalThumbFile != null && finalThumbFile.exists() && finalFile != null) {
                        try {
                            // 1. Save to internal app storage (hidden from gallery)
                            val thumbDir = File(reactApplicationContext.filesDir, "thumbnails")
                            if (!thumbDir.exists()) {
                                thumbDir.mkdirs()
                                try { File(thumbDir, ".nomedia").createNewFile() } catch (e: Exception) {}
                            }
                            val finalName = finalFile.nameWithoutExtension
                            val targetThumb = File(thumbDir, "$finalName.jpg")
                            finalThumbFile.copyTo(targetThumb, overwrite = true)

                            // When the art could not be embedded (no ffmpeg, so the track stayed
                            // m4a/webm), also publish a cover for the track.
                            // Otherwise the track has no artwork anywhere. WAV is
                            // excluded: artwork is explicitly unwanted on it.
                            if (!artEmbedded && isAudioDownload && finalFile.extension.lowercase() != "wav") {
                                val coverName = "$finalName.jpg"
                                if (publishCoverImage(finalThumbFile, coverName, platform)) {
                                    Log.d(TAG, "Saved cover for ${finalFile.name} (art could not be embedded)")
                                }
                            }
                            
                            // 2. Cleanup: If the override thumbnail was in our cache, delete it now
                            if (overrideThumbnailPath != null && overrideThumbnailPath.contains(reactApplicationContext.cacheDir.absolutePath)) {
                                try { File(overrideThumbnailPath).delete() } catch (e: Exception) {}
                            }

                            // Cleanup if we used the yt-dlp extracted one
                            if (thumbFile != null && thumbFile.exists() && finalThumbFile.absolutePath == thumbFile.absolutePath) {
                                thumbFile.delete()
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed to preserve thumbnail", e)
                        }
                    }
                    
                    if (finalFile != null) {
                         val result = WritableNativeMap().apply {
                            putString("processId", processId)
                            putString("outputDir", finalFile.parent)
                            putString("filePath", finalFile.absolutePath)
                            putString("fileName", finalFile.name)
                            putString("platform", platform)
                            putInt("exitCode", 0) // Important: UI expects exitCode 0 to show success
                            // False when a cut was asked for but could not be applied, so
                            // the UI can say the full video was saved instead of failing.
                            putBoolean("cutApplied", cutApplied)
                        }
                        
                        showDownloadNotification(finalFile.name, finalFile.absolutePath, platform)
                        cacheDir.deleteRecursively() // Cleanup cache
                        
                        withContext(Dispatchers.Main) { promise.resolve(result) }
                    } else {
                        throw Exception("Failed to move file to storage")
                    }
                } else {
                    throw Exception("Download file not found")
                }
                
            } catch (e: Exception) {
                try {
                    val cacheDir = File(reactApplicationContext.cacheDir, "temp_download_$processId")
                    if (cacheDir.exists()) cacheDir.deleteRecursively()
                } catch (e2: Exception) {}
                
                activeDownloads.remove(processId)
                updateServiceState()
                withContext(Dispatchers.Main) {
                    promise.reject("DOWNLOAD_ERROR", "Download failed: ${e.message}", e)
                }
            }
        }
    }
    
    /**
     * Download Spotify track by searching on YouTube
     * This method bypasses Spotify DRM by using YouTube as the audio source
     * @param searchQuery - YouTube search query (e.g., "Artist - Song Title")
     * @param title - Track title from Spotify
     * @param artist - Artist name from Spotify
     * @param thumbnail - Thumbnail URL from Spotify (for embedding)
     * @param processId - Unique process ID for tracking
     */
    @ReactMethod
    fun downloadSpotifyTrack(searchQuery: String, title: String, artist: String, album: String, thumbnail: String?, processId: String, promise: Promise) {
        if (!isInitialized) initializeYtDlp()
        
        val isCancelled = AtomicBoolean(false)
        activeDownloads[processId] = isCancelled
        updateServiceState()
        
        scope.launch {
            try {
                // Use general YouTube search instead of YouTube Music search as it is more reliable
                val ytSearchUrl = "ytsearch1:$searchQuery"
                
                // 1. Download to temp cache directory first (process-specific)
                val cacheDir = File(reactApplicationContext.cacheDir, "temp_download_$processId")
                if (!cacheDir.exists()) cacheDir.mkdirs()
                
                Log.d(TAG, "Starting Spotify download via YouTube Music search: $searchQuery")
                
                val request = YoutubeDLRequest(ytSearchUrl)
                val safeFileName = title.replace(Regex("[^a-zA-Z0-9 \\-_]"), "_").take(100)
                // The search target is YouTube Music, so it needs the same JS
                // runtime as any other YouTube extraction.
                applyJsRuntime(request)
                
                val spotifyFfmpegLoc = getFFmpegLocation()
                if (spotifyFfmpegLoc != null) {
                    request.addOption("--ffmpeg-location", spotifyFfmpegLoc)
                }
                val ffmpegAvailable = spotifyFfmpegLoc != null && isFfmpegAvailable()
                if (!ffmpegAvailable) {
                    Log.w(TAG, "Spotify: no usable ffmpeg, saving the source audio stream as-is")
                }

                // Pre-download the Spotify thumbnail so it can be embedded/sidecarred.
                // This is a plain HTTP fetch, so it is not gated on ffmpeg.
                if (!thumbnail.isNullOrEmpty()) {
                    try {
                        val thumbFile = File(cacheDir, "$safeFileName.jpg")
                        val thumbUrl = URL(thumbnail)
                        BufferedInputStream(thumbUrl.openStream()).use { input ->
                            FileOutputStream(thumbFile).use { output ->
                                val data = ByteArray(1024)
                                var count: Int
                                while (input.read(data).also { count = it } != -1) {
                                    output.write(data, 0, count)
                                }
                            }
                        }
                        Log.d(TAG, "Pre-downloaded Spotify thumbnail for embedding: ${thumbFile.absolutePath}")
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to pre-download Spotify thumbnail: ${e.message}")
                    }
                }
                
                request.addOption("-o", "${cacheDir.absolutePath}/$safeFileName.%(ext)s")
                request.addOption("--no-playlist")
                
                // Audio download settings - transcoding needs ffmpeg, so without it we take the
                // source stream instead of failing the whole download.
                if (ffmpegAvailable) {
                    request.addOption("-x")
                    request.addOption("--audio-format", "mp3")
                    request.addOption("--audio-quality", "0")
                } else {
                    // Prefer an m4a/AAC stream: without ffmpeg the container is kept
                    // as-is, and MediaStore only accepts the well-known audio MIME
                    // types, so m4a still files under Music while webm cannot.
                    request.addOption("-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best")
                }

                // Metadata & Thumbnails - embed cover art from YouTube into the MP3 ID3 tags
                if (ffmpegAvailable) {
                    request.addOption("--embed-metadata")
                    request.addOption("--embed-thumbnail")
                    if (!thumbnail.isNullOrEmpty()) {
                        // Force yt-dlp to use our pre-downloaded Spotify thumbnail
                        request.addOption("--no-write-thumbnail")
                    } else {
                        request.addOption("--write-thumbnail")
                        request.addOption("--convert-thumbnails", "jpg")
                    }
                } else if (thumbnail.isNullOrEmpty()) {
                    // No Spotify art and no ffmpeg: still keep the track's own
                    // thumbnail on disk so the JAudioTagger step has artwork.
                    request.addOption("--write-thumbnail")
                }
                
                // Network options
                request.addOption("--force-ipv4")
                request.addOption("--no-check-certificate")
                request.addOption("--socket-timeout", "30")
                
                val response = YoutubeDL.getInstance().execute(request, processId) { progress, eta, line ->
                    if (isCancelled.get()) return@execute
                    
                    val displayLine = when {
                        line.isNullOrEmpty() -> "Preparing..."
                        line.contains("Searching", ignoreCase = true) -> "Searching YouTube..."
                        line.contains("Downloading", ignoreCase = true) && progress > 0 -> "${progress.toInt()}% - Downloading..."
                        line.contains("Converting", ignoreCase = true) -> "Converting to MP3..."
                        line.contains("Extracting", ignoreCase = true) -> "Extracting audio..."
                        line.contains("ffmpeg", ignoreCase = true) -> "Processing..."
                        else -> line.take(50).let { if (it.length < line.length) "$it..." else it }
                    }
                    
                    val params = WritableNativeMap().apply {
                        putString("processId", processId)
                        putDouble("progress", progress.toDouble())
                        putDouble("eta", eta.toDouble())
                        putString("line", displayLine)
                    }
                    sendEvent("onDownloadProgress", params)
                    showProgressNotification(processId, "Downloading $title...", progress.toInt(), displayLine)
                }
                
                cancelNotification(processId)
                activeDownloads.remove(processId)
                updateServiceState()
                
                if (isCancelled.get()) {
                    cacheDir.listFiles()?.forEach { it.delete() }
                    withContext(Dispatchers.Main) { promise.reject("CANCELLED", "Download was cancelled") }
                    return@launch
                }
                
                // Find downloaded file. Without ffmpeg the source stream is kept, so the result
                // is not necessarily mp3 - matching on mp3 alone made a successful
                // download look like a failure.
                val audioExtensions = setOf("mp3", "m4a", "webm", "opus", "ogg", "aac", "flac", "wav")
                val downloadedFile = cacheDir.listFiles()
                    ?.filter {
                        it.isFile &&
                            it.lastModified() > System.currentTimeMillis() - 300000 &&
                            it.extension.lowercase() in audioExtensions
                    }
                    ?.maxByOrNull { it.lastModified() }

                if (downloadedFile != null && downloadedFile.exists()) {
                    // --- High-Res Album Art and Metadata Embedding (JAudioTagger) ---
// JAudioTagger reads and writes MP3/AIFF; MP4 artwork needs the "covr" atom
                        // which this library does not implement. WAV is excluded on
                        // purpose - no artwork is wanted there.
                        try {
                            val ext = downloadedFile.extension.lowercase()
                            if (ext == "wav") {
                                Log.d(TAG, "Skipping album art for wav: artwork is not wanted on wav")
                            } else if (ext == "mp3" || ext == "aiff") {

                            Log.d(TAG, "Embedding Spotify metadata tags and high-res album art via JAudioTagger...")
                            downloadedFile.setWritable(true)
                            val audioFile = AudioFileIO.read(downloadedFile)
                            val tag = audioFile.tagOrCreateAndSetDefault

                            // Set standard text tags from Spotify
                            tag.setField(FieldKey.TITLE, title)
                            tag.setField(FieldKey.ARTIST, artist)
                            tag.setField(FieldKey.ALBUM, album)

                            // Spotify special: prefer the high-res art we pre-downloaded,
                            // otherwise fall back to the thumbnail yt-dlp wrote.
                            val preDownloadedThumb = File(cacheDir, "$safeFileName.jpg").takeIf { it.exists() }
                                ?: cacheDir.listFiles()?.firstOrNull {
                                    it.isFile && it.extension.lowercase() in setOf("jpg", "jpeg", "webp", "png")
                                }
                            if (preDownloadedThumb != null) {
                                val artwork = ArtworkFactory.createArtworkFromFile(preDownloadedThumb)
                                tag.deleteArtworkField()
                                tag.setField(artwork)
                                Log.d(TAG, "Spotify album art embedded successfully from ${preDownloadedThumb.name}")
                            } else {
                                Log.w(TAG, "No cover art found for Spotify track; skipping artwork")
                            }

                            audioFile.commit()
                            Log.d(TAG, "JAudioTagger commit completed successfully")
                        } else {
                            Log.w(TAG, "Skipping tag embedding: .${downloadedFile.extension} is not a writable tag container")
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "JAudioTagger embedding failed for Spotify: ${e.message}")
                    }
 
                    // 1. Move MP3 to public storage
                    val finalFile = moveToPublicStorage(downloadedFile, "Spotify", "Music")
                    
                    if (finalFile != null) {
                         // 2. Save sidecar thumbnail (as per user request)
                         val preDownloadedThumb = File(cacheDir, "$safeFileName.jpg")
                         if (!thumbnail.isNullOrEmpty()) {
                            try {
                                val thumbDir = File(reactApplicationContext.filesDir, "thumbnails")
                                if (!thumbDir.exists()) {
                                    thumbDir.mkdirs()
                                    try { File(thumbDir, ".nomedia").createNewFile() } catch (e: Exception) {}
                                }
                                val targetThumb = File(thumbDir, "${finalFile.nameWithoutExtension}.jpg")
                                
                                if (preDownloadedThumb.exists()) {
                                    preDownloadedThumb.copyTo(targetThumb, overwrite = true)
                                } else {
                                    // Fallback download if somehow missing
                                    val thumbUrl = URL(thumbnail)
                                    BufferedInputStream(thumbUrl.openStream()).use { input ->
                                        FileOutputStream(targetThumb).use { output ->
                                            input.copyTo(output)
                                        }
                                    }
                                }
                                
                                Log.d(TAG, "Saved thumbnail sidecar for Spotify: ${targetThumb.absolutePath}")
                            } catch (e: Exception) {
                                Log.w(TAG, "Failed to save Spotify sidecar thumbnail: ${e.message}")
                            }
                          }
                     
                        val result = WritableNativeMap().apply {
                            putString("processId", processId)
                            putString("outputDir", finalFile.parent)
                            putString("filePath", finalFile.absolutePath)
                            putString("fileName", finalFile.name)
                            putString("platform", "Spotify")
                        }
                        
                        showDownloadNotification("$artist - $title", finalFile.absolutePath, "Spotify")
                        cacheDir.deleteRecursively() // Cleanup cache
                        withContext(Dispatchers.Main) { promise.resolve(result) }
                    } else {
                        throw Exception("Failed to move file to public storage")
                    }
                } else {
                    throw Exception("Downloaded file not found")
                }
                
            } catch (e: Exception) {
                try {
                    val cacheDir = File(reactApplicationContext.cacheDir, "temp_download_$processId")
                    if (cacheDir.exists()) cacheDir.deleteRecursively()
                } catch (e2: Exception) {}
                
                activeDownloads.remove(processId)
                updateServiceState()
                withContext(Dispatchers.Main) {
                    promise.reject("DOWNLOAD_ERROR", e.message ?: "Failed to download from YouTube Music", e)
                }
            }
        }
    }
    
    @ReactMethod
    fun listDownloadedFiles(promise: Promise) {
        scope.launch {
            try {
                val thumbDir = File(reactApplicationContext.filesDir, "thumbnails")
                val filesArray = WritableNativeArray()
                
                // getOrganizedOutputDir writes downloads to the app-specific external
                // dir, so that is the location that actually holds new media; the
                // public VibeDownloader folders are legacy roots kept for older files.
                val scanRoots = listOfNotNull(
                    File(reactApplicationContext.getExternalFilesDir(null), "vibedownloader"),
                    File(reactApplicationContext.filesDir, "vibedownloader")
                ) + listOf(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES),
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC),
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                ).map { File(it, "VibeDownloader") }

                val seenPaths = HashSet<String>()

                for (vibeDir in scanRoots) {
                    if (!vibeDir.exists()) continue
                    
                    // Recursively find all files in the vibedownloader directory
                    vibeDir.walkTopDown().forEach { file ->
                        if (file.isFile && !file.isHidden && seenPaths.add(file.absolutePath)) {
                            // Extract platform and content type from path
                            // Path format: VibeDownloader/[Platform]/[ContentType]/filename.ext
                            val relativePath = file.absolutePath.removePrefix(vibeDir.absolutePath + "/")
                            val pathParts = relativePath.split("/")
                            
                            val platform = if (pathParts.size >= 2) pathParts[0] else "Unknown"
                            val contentType = when {
                                vibeDir.absolutePath.contains("Music") -> "Music"
                                vibeDir.absolutePath.contains("Pictures") -> if (pathParts.size >= 3) pathParts[1] else "Images"
                                vibeDir.absolutePath.contains("Movies") -> if (pathParts.size >= 3) pathParts[1] else "Videos"
                                pathParts.size >= 3 -> {
                                    // Handle cases where files might be in subfolders like "Shorts" or "Reels"
                                    val type = pathParts[1]
                                    // Normalize "Shorts" for Instagram to "Reels" if needed, 
                                    // but usually we trust the folder name created by getContentType
                                    if (platform == "Instagram" && type == "Shorts") "Reels" else type
                                }
                                else -> "Downloads"
                            }
                            
                            // Resolve thumbnail: prefer sidecar file, but for audio files also
                            // try the MediaStore album art URI (populated when --embed-thumbnail is used)
                            val thumbPath = File(thumbDir, "${file.nameWithoutExtension}.jpg")
                            val sidecarThumb = File(file.parentFile, "${file.nameWithoutExtension}.jpg")
                            val thumbnail: String? = when {
                                thumbPath.exists() -> "file://${thumbPath.absolutePath}"
                                sidecarThumb.exists() -> "file://${sidecarThumb.absolutePath}"
                                listOf("mp3", "m4a", "flac", "aac", "wav").contains(file.extension.lowercase()) -> {
                                    // Look up album art from MediaStore for embedded-thumbnail audio
                                    val resolver = reactApplicationContext.contentResolver
                                    val selection = "${android.provider.MediaStore.Audio.Media.DATA} = ?"
                                    val selectionArgs = arrayOf(file.absolutePath)
                                    var artUri: String? = null
                                    resolver.query(
                                        android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                                        arrayOf(android.provider.MediaStore.Audio.Media._ID),
                                        selection, selectionArgs, null
                                    )?.use { cursor ->
                                        if (cursor.moveToFirst()) {
                                            val id = cursor.getLong(cursor.getColumnIndexOrThrow(android.provider.MediaStore.Audio.Media._ID))
                                            artUri = "content://media/external/audio/albumart/$id"
                                        }
                                    }
                                    artUri
                                }
                                else -> null
                            }
                            
                            val fileMap = WritableNativeMap().apply {
                                putString("name", file.name)
                                putString("path", file.absolutePath)
                                putDouble("size", file.length().toDouble())
                                putDouble("modified", file.lastModified().toDouble())
                                putString("platform", platform)
                                putString("contentType", contentType)
                                putString("extension", file.extension)
                                putString("thumbnail", thumbnail)
                                putDouble("duration", mediaDurationMs(file))
                                putString("mimeType", mimeForPath(file.absolutePath))
                            }
                            filesArray.pushMap(fileMap)
                        }
                    }
                }
                
                withContext(Dispatchers.Main) {
                    promise.resolve(filesArray)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("LIST_ERROR", e.message)
                }
            }
        }
    }

    @ReactMethod
fun cancelDownload(processId: String, promise: Promise) {
          val isCancelled = activeDownloads[processId]
          // A cut runs after yt-dlp has exited, so destroying the yt-dlp process
          // alone would leave ffmpeg churning on a file the user abandoned.
          activeCutProcesses.remove(processId)?.let { process ->
              try {
                  process.destroy()
                  if (!process.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)) process.destroyForcibly()
              } catch (e: Exception) {
                  Log.w(TAG, "Error destroying cut process: ${e.message}")
              }
          }
          if (isCancelled != null) {
            isCancelled.set(true)
            try {
                // Force kill logic if needed, usually destroyProcessById is proper
                YoutubeDL.getInstance().destroyProcessById(processId)
            } catch (e: Exception) {
                Log.e(TAG, "Error destroying process", e)
            }
            activeDownloads.remove(processId)
            updateServiceState()
            promise.resolve(true)
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun updateYtDlp(promise: Promise) {
        scope.launch {
            try {
                val status = YoutubeDL.getInstance().updateYoutubeDL(reactApplicationContext, YoutubeDL.UpdateChannel.STABLE)
                withContext(Dispatchers.Main) {
                    val result = WritableNativeMap().apply { putString("status", status?.name ?: "UNKNOWN") }
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { promise.reject("UPDATE_ERROR", e.message, e) }
            }
        }
    }
    
    @ReactMethod
    fun validateUrl(url: String, promise: Promise) {
        val isValid = isValidPlatform(url)
        val result = WritableNativeMap().apply {
            putBoolean("valid", isValid)
            putString("platform", if (isValid) getPlatformName(url) else null)
        }
        promise.resolve(result)
    }

    @ReactMethod
    fun getSupportedPlatforms(promise: Promise) {
        val platforms = WritableNativeArray().apply {
            SUPPORTED_DOMAINS.forEach { pushString(it) }
        }
        promise.resolve(platforms)
    }

    @ReactMethod
    fun getOutputDirectory(promise: Promise) {
        try {
            val baseDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
            val vibeDir = File(baseDir, "VibeDownloader")
            promise.resolve(vibeDir.absolutePath)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }



    
    /** Best-effort MIME for a downloaded file, including the text sidecars. */
    private fun mimeForPath(filePath: String): String {
        val lower = filePath.lowercase()
        return when {
            lower.endsWith(".mp4") -> "video/mp4"
            lower.endsWith(".webm") -> "video/webm"
            lower.endsWith(".mkv") -> "video/x-matroska"
            lower.endsWith(".mov") -> "video/quicktime"
            lower.endsWith(".avi") -> "video/x-msvideo"
            lower.endsWith(".mp3") -> "audio/mpeg"
            lower.endsWith(".m4a") -> "audio/m4a"
            lower.endsWith(".flac") -> "audio/flac"
            lower.endsWith(".ogg") -> "audio/ogg"
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".webp") -> "image/webp"
            // Without these, text sidecars fell through to * / * and no activity
            // claimed the intent, so sharing or opening them threw.
            lower.endsWith(".srt") -> "application/x-subrip"
            lower.endsWith(".vtt") -> "text/vtt"
            lower.endsWith(".ttml") -> "application/ttml+xml"
            lower.endsWith(".lrc") -> "text/plain"
            lower.endsWith(".txt") -> "text/plain"
            else -> "*/*"
        }
    }

    /** Extensions the retriever can decode a poster frame from. */
    private val VIDEO_EXTENSIONS = setOf("mp4", "webm", "mkv", "mov", "avi", "3gp", "m4v")

    /**
     * Duration in milliseconds for playable media, or -1.
     *
     * The gallery sorts and labels by length, and a bare filename carries no
     * timing at all. Failure is tolerated because a missing duration should
     * degrade the label, not hide the file.
     */
    private fun mediaDurationMs(file: File): Double {
        val ext = file.extension.lowercase()
        if (ext !in VIDEO_EXTENSIONS && ext !in AUDIO_EXTENSIONS) return -1.0
        val retriever = android.media.MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toLongOrNull()?.toDouble() ?: -1.0
        } catch (e: Exception) {
            -1.0
        } finally {
            try { retriever.release() } catch (ignored: Exception) {}
        }
    }

    /**
     * Poster frame for a video, cached on disk by path and mtime.
     *
     * The gallery previously had no poster for videos at all, so every video
     * rendered as a generic icon. The frame is generated on demand rather than
     * shipped, and the cache key folds in mtime so an edited or re-downloaded
     * file regenerates instead of showing a stale poster.
     *
     * @param targetWidth decode width in px; kept small because this runs per
     *   grid cell and a full-size frame would thrash memory on a long list.
     * @return a file:// URI for the cached JPEG, or null when unavailable.
     */
    private fun videoThumbnail(file: File, targetWidth: Int = 480): String? {
        val ext = file.extension.lowercase()
        if (ext !in VIDEO_EXTENSIONS || !file.exists() || file.length() == 0L) return null

        val cacheDir = File(reactApplicationContext.cacheDir, "videothumbs").apply { mkdirs() }
        val key = "${file.absolutePath.hashCode().toUInt()}-${file.lastModified()}-${file.length()}"
        val cached = File(cacheDir, "$key.jpg")
        if (cached.exists() && cached.length() > 0L) return "file://${cached.absolutePath}"

        val retriever = android.media.MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            val durationMs = retriever
                .extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toLongOrNull() ?: 0L
            // Sample away from the very start: the opening frames of a download
            // are frequently black, a fade-in, or a still slate.
            val at = (durationMs / 8).coerceAtLeast(1_000_000L)
            val bitmap = retriever.getFrameAtTime(
                at,
                android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC
            ) ?: retriever.frameAtTime

            if (bitmap != null) {
                val scaled = if (bitmap.width > targetWidth) {
                    val h = (bitmap.height.toLong() * targetWidth / bitmap.width).toInt().coerceAtLeast(1)
                    android.graphics.Bitmap.createScaledBitmap(bitmap, targetWidth, h, true)
                } else bitmap

                FileOutputStream(cached).use { out ->
                    scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 82, out)
                }
                if (scaled !== bitmap) scaled.recycle()
                bitmap.recycle()
                "file://${cached.absolutePath}"
            } else null
        } catch (e: Exception) {
            // A corrupt or codec-unsupported video must not fail the whole
            // listing, so the caller just falls back to the icon tile.
            Log.w(TAG, "Video thumbnail failed for ${file.name}: ${e.message}")
            null
        } finally {
            try { retriever.release() } catch (ignored: Exception) {}
        }
    }

    /**
     * Creates a poster JPEG for a video and returns its file:// URI.
     *
     * Exposed because the gallery requests posters lazily, one screenful at a
     * time, instead of decoding every video up front during listing.
     */
    @ReactMethod
    fun getMediaThumbnail(filePath: String, promise: Promise) {
        scope.launch {
            try {
                val uri = withContext(Dispatchers.IO) { videoThumbnail(File(filePath)) }
                withContext(Dispatchers.Main) { promise.resolve(uri) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { promise.reject("THUMBNAIL_ERROR", e.message) }
            }
        }
    }

    /** Audio containers, used to decide whether a duration is worth reading. */
    private val AUDIO_EXTENSIONS = setOf("mp3", "m4a", "flac", "aac", "wav", "ogg", "opus")

    /**
     * Reads a UTF-8 text file (lyrics, subtitles) for the in-app viewer.
     *
     * There is no filesystem library on the JS side, so the viewer needs this.
     * Capped so a mistyped path cannot pull an unbounded file into memory.
     */
    @ReactMethod
    fun readTextFile(filePath: String, promise: Promise) {
        scope.launch {
            try {
                val file = File(filePath)
                if (!file.exists() || file.isDirectory) {
                    withContext(Dispatchers.Main) {
                        promise.reject("FILE_NOT_FOUND", "File does not exist: $filePath")
                    }
                    return@launch
                }
                if (file.length() > MAX_TEXT_FILE_BYTES) {
                    withContext(Dispatchers.Main) {
                        promise.reject("FILE_TOO_LARGE", "File is too large to preview")
                    }
                    return@launch
                }
                val content = withContext(Dispatchers.IO) { file.readText() }
                withContext(Dispatchers.Main) { promise.resolve(content) }
            } catch (e: Exception) {
                Log.e(TAG, "readTextFile failed", e)
                withContext(Dispatchers.Main) {
                    promise.reject("READ_ERROR", e.message ?: "Failed to read file", e)
                }
            }
        }
    }

    @ReactMethod
    fun openFile(filePath: String, promise: Promise) {
        try {
            val file = File(filePath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "File does not exist")
                return
            }
            
            val uri = FileProvider.getUriForFile(
                reactApplicationContext,
                "${reactApplicationContext.packageName}.fileprovider",
                file
            )
            
            val mimeType = mimeForPath(filePath)

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun shareFile(filePath: String, promise: Promise) {
        try {
            val file = File(filePath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "File does not exist")
                return
            }
            
            val uri = FileProvider.getUriForFile(
                reactApplicationContext,
                "${reactApplicationContext.packageName}.fileprovider",
                file
            )
            
            val mimeType = mimeForPath(filePath)

            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = mimeType
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            
            val chooserIntent = Intent.createChooser(shareIntent, "Share via")
            chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(chooserIntent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SHARE_ERROR", e.message)
        }
    }
    
    @ReactMethod
    fun deleteFile(filePath: String, promise: Promise) {
        scope.launch {
            try {
                val file = File(filePath)
                var deleted = false
                
                Log.d(TAG, "Attempting to delete file: $filePath")

                // 1. Try cleanup of private sidecar files first
                val thumbDirs = listOf(
                    // Artwork is written to filesDir during download, so that is
                    // the dir that actually holds these. The old code only
                    // cleaned getExternalFilesDir, so every deleted download left
                    // its artwork behind on disk.
                    File(reactApplicationContext.filesDir, "thumbnails"),
                    File(reactApplicationContext.getExternalFilesDir(null), "thumbnails")
                )
                for (dir in thumbDirs) {
                    try {
                        val thumbFile = File(dir, "${file.nameWithoutExtension}.jpg")
                        if (thumbFile.exists()) thumbFile.delete()
                    } catch (e: Exception) {
                        Log.w(TAG, "Failed to delete thumbnail sidecar in $dir")
                    }
                }

                // Drop the cached poster frame so a re-download of the same path
                // cannot resurrect the old video's thumbnail.
                try {
                    val videoCache = File(reactApplicationContext.cacheDir, "videothumbs")
                    videoCache.listFiles()
                        ?.filter { it.name.startsWith("${file.absolutePath.hashCode().toUInt()}-") }
                        ?.forEach { it.delete() }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to clear cached video thumbnail")
                }

                // 2. Try direct file deletion (Works on legacy storage or app-private dirs)
                if (file.exists()) {
                    try {
                        if (file.delete()) {
                            Log.d(TAG, "Direct file deletion success")
                            deleted = true
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "Direct deletion failed, will try MediaStore")
                    }
                }
                
                // 3. MediaStore deletion (Mandatory for Scoped Storage on API 29+)
                if (!deleted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val resolver = reactApplicationContext.contentResolver
                    val collections = listOf(
                        android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                        android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                        android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                        android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        android.provider.MediaStore.Files.getContentUri("external")
                    )
                    
                    val projection = arrayOf(android.provider.MediaStore.MediaColumns._ID)
                    val selection = "${android.provider.MediaStore.MediaColumns.DATA} = ?"
                    val selectionArgs = arrayOf(filePath)
                    
                    for (collectionUri in collections) {
                        try {
                            resolver.query(collectionUri, projection, selection, selectionArgs, null)?.use { cursor ->
                                if (cursor.moveToFirst()) {
                                    val idColumn = cursor.getColumnIndexOrThrow(android.provider.MediaStore.MediaColumns._ID)
                                    val id = cursor.getLong(idColumn)
                                    val contentUri = android.content.ContentUris.withAppendedId(collectionUri, id)
                                    val rowsDeleted = resolver.delete(contentUri, null, null)
                                    if (rowsDeleted > 0) {
                                        Log.d(TAG, "MediaStore deletion success for: $collectionUri")
                                        deleted = true
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Failed query/delete in $collectionUri")
                        }
                        if (deleted) break
                    }
                }
                
                // 4. Final verification and scanner update
                if (deleted || !File(filePath).exists()) {
                    // Update media scanner so file disappears from gallery apps immediately
                    android.media.MediaScannerConnection.scanFile(
                        reactApplicationContext, 
                        arrayOf(filePath), 
                        null, 
                        null
                    )
                    withContext(Dispatchers.Main) { promise.resolve(true) }
                } else {
                    withContext(Dispatchers.Main) { promise.resolve(false) }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { promise.reject("DELETE_ERROR", e.message) }
            }
        }
    }

    /**
     * Deletes several files, reporting per-file success.
     *
     * Bulk delete in the gallery must not be all-or-nothing: if one file is held
     * by something else, the rest should still go and the user should be told
     * exactly which ones survived. Returns `{ deleted: string[],
     * failed: string[] }` rather than a single boolean so the UI can name the
     * failures instead of silently claiming everything worked.
     *
     * Runs sequentially on IO because each call does its own MediaStore query;
     * doing them in parallel on scoped storage just contends on the resolver.
     */
    @ReactMethod
    fun deleteFiles(filePaths: ReadableArray, promise: Promise) {
        scope.launch {
            val deleted = WritableNativeArray()
            val failed = WritableNativeArray()
            try {
                for (i in 0 until filePaths.size()) {
                    val path = filePaths.getString(i) ?: continue
                    val ok = withContext(Dispatchers.IO) { deleteOne(path) }
                    if (ok) deleted.pushString(path) else failed.pushString(path)
                }
                val result = WritableNativeMap().apply {
                    putArray("deleted", deleted)
                    putArray("failed", failed)
                }
                withContext(Dispatchers.Main) { promise.resolve(result) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { promise.reject("DELETE_ERROR", e.message) }
            }
        }
    }

    /**
     * Single-file delete without a promise, shared by [deleteFile] and the bulk
     * path so both get identical MediaStore fallback and scanner behaviour.
     */
    private suspend fun deleteOne(filePath: String): Boolean {
        val file = File(filePath)
        var deleted = false

        // Clean up both thumbnail locations plus the cached poster frame.
        for (dir in listOf(
            File(reactApplicationContext.filesDir, "thumbnails"),
            File(reactApplicationContext.getExternalFilesDir(null), "thumbnails")
        )) {
            try {
                val thumbFile = File(dir, "${file.nameWithoutExtension}.jpg")
                if (thumbFile.exists()) thumbFile.delete()
            } catch (e: Exception) {
                Log.w(TAG, "Failed to delete thumbnail sidecar in $dir")
            }
        }
        try {
            File(reactApplicationContext.cacheDir, "videothumbs").listFiles()
                ?.filter { it.name.startsWith("${file.absolutePath.hashCode().toUInt()}-") }
                ?.forEach { it.delete() }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to clear cached video thumbnail")
        }

        if (file.exists()) {
            try {
                if (file.delete()) deleted = true
            } catch (e: Exception) {
                Log.d(TAG, "Direct deletion failed, will try MediaStore")
            }
        }

        // Scoped storage: the file is still owned by MediaStore, not the path.
        if (!deleted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = reactApplicationContext.contentResolver
            val collections = listOf(
                android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                android.provider.MediaStore.Files.getContentUri("external")
            )
            val selection = "${android.provider.MediaStore.MediaColumns.DATA} = ?"
            val selectionArgs = arrayOf(filePath)

            for (collectionUri in collections) {
                try {
                    resolver.query(
                        collectionUri,
                        arrayOf(android.provider.MediaStore.MediaColumns._ID),
                        selection, selectionArgs, null
                    )?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val id = cursor.getLong(
                                cursor.getColumnIndexOrThrow(android.provider.MediaStore.MediaColumns._ID)
                            )
                            if (resolver.delete(
                                    android.content.ContentUris.withAppendedId(collectionUri, id),
                                    null, null
                                ) > 0
                            ) {
                                deleted = true
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Failed query/delete in $collectionUri")
                }
                if (deleted) break
            }
        }

        if (deleted || !File(filePath).exists()) {
            // Rescan so the file vanishes from other gallery apps immediately
            // instead of lingering until the next media scan.
            android.media.MediaScannerConnection.scanFile(
                reactApplicationContext, arrayOf(filePath), null, null
            )
            return true
        }
        return false
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
