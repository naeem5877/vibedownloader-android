package com.vibedownloadermobile.story

import android.util.Base64
import android.util.Log
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * A single story asset resolved through SnapSave.
 *
 * [downloadUrl] and [thumbnailUrl] point at SnapSave's CDN (`d.rapidcdn.app`),
 * not at Instagram. That is deliberate: the real Instagram CDN url carried in
 * [realUrl] answers 403 for anyone but the token holder, so it is only useful
 * for identifying the file and for reading its container from the path.
 */
data class StoryMedia(
    val id: String,
    val downloadUrl: String,
    val thumbnailUrl: String,
    val realUrl: String,
    val filename: String,
    val userAgent: String,
    val isImage: Boolean,
)

sealed class SnapSaveResult {
    data class Ok(val items: List<StoryMedia>) : SnapSaveResult()
    data class Failed(val message: String, val code: String) : SnapSaveResult()
}

/**
 * Fetches Instagram/Facebook story media through SnapSave.
 *
 * SnapSave answers `action.php` with the download markup wrapped in an
 * obfuscation layer: a tiny self-decoding `eval(...)` that expands into the
 * script that would populate the page. There is no plain-HTML variant of the
 * response, so the wrapper has to be undone before the markup can be read.
 *
 * The wrapper is three layers:
 *  - the payload string `h`, cut into chunks on a separator taken from `n`
 *  - each chunk has the characters of `n` swapped for their index in `n`
 *  - each chunk is then a base-`e` number (digits `0..e-1`, everything else is
 *    noise) which is re-rendered in base `f`, offset by `t`, into one character
 *
 * SnapSave re-signs every response, so the token payload always has roughly an
 * hour of life and never needs caching on our side.
 */
object SnapSaveClient {

    private const val TAG = "SnapSaveClient"
    private const val ACTION_URL = "https://snapsave.app/action.php?lang=id"
    private const val RAPID_HOST = "d.rapidcdn.app"

    /** Digits used by the wrapper's number decoder, in order. */
    private const val ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/"

    /** Anything past this in a chunk is filler, not a number worth decoding. */
    private const val READ_LIMIT = 1L shl 40

    private val DIGITS: List<String> = ALPHABET.map { it.toString() }

    private const val DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

    /** Used when a token does not carry its own user agent. */
    const val DEFAULT_USER_AGENT = DESKTOP_UA

    /** Signatures live about an hour; re-fetching sooner is cheap and always fresh. */
    private const val MIN_SECONDS_LEFT = 120

    fun fetch(targetUrl: String, cookieHeader: String?, timeoutMs: Int = 30_000): SnapSaveResult {
        val body = try {
            post(targetUrl, cookieHeader, timeoutMs)
        } catch (e: Exception) {
            Log.w(TAG, "request failed: ${e.message}")
            return SnapSaveResult.Failed("Could not reach SnapSave: ${e.message}", "network")
        }

        if (body.isBlank()) {
            return SnapSaveResult.Failed("SnapSave returned an empty page.", "empty")
        }

        val decoded = unwrap(body)
        if (decoded == null) {
            // A non-wrapped response would already carry the tokens; tolerate it.
            if (body.contains("$RAPID_HOST/v2?token=")) return parse(body)
            return SnapSaveResult.Failed("SnapSave sent a page we could not read.", "unparsable")
        }

        // The wrapper only renders inside a time window. Checked here so a stale
        // mirror fails with something a user can act on instead of "no stories".
        if (!windowIsOpen(decoded)) {
            return SnapSaveResult.Failed("SnapSave's response had expired, try again.", "expired")
        }

        val failure = readAlert(decoded)
        if (failure != null) return failure

        return parse(decoded)
    }

    // ---------------------------------------------------------------- transport

    private fun post(targetUrl: String, cookieHeader: String?, timeoutMs: Int): String {
        val conn = URL(ACTION_URL).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = timeoutMs
            conn.readTimeout = timeoutMs
            conn.instanceFollowRedirects = true
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            conn.setRequestProperty(
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            )
            conn.setRequestProperty("User-Agent", DESKTOP_UA)
            conn.setRequestProperty("Origin", "https://snapsave.app")
            conn.setRequestProperty("Referer", "https://snapsave.app/")
            if (!cookieHeader.isNullOrBlank()) {
                conn.setRequestProperty("Cookie", cookieHeader)
            }

            val payload = "url=" + URLEncoder.encode(targetUrl, "UTF-8")
            conn.doOutput = true
            conn.outputStream.use { it.write(payload.toByteArray(StandardCharsets.UTF_8)) }

            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.let { readAll(it) }.orEmpty()
            if (status !in 200..299 && text.isBlank()) {
                throw IllegalStateException("SnapSave returned HTTP $status")
            }
            return text
        } finally {
            conn.disconnect()
        }
    }

    private fun readAll(stream: java.io.InputStream): String =
        BufferedInputStream(stream).use { input ->
            val out = ByteArrayOutputStream(64 * 1024)
            val buf = ByteArray(16 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n <= 0) break
                out.write(buf, 0, n)
            }
            String(out.toByteArray(), StandardCharsets.UTF_8)
        }

    // ----------------------------------------------------------------- decoding

    /**
     * Runs the page's own decoder and returns the script it expands to, or null
     * when the response was not wrapped.
     *
     * The `eval` holds a function literal followed by its arguments, so the
     * arguments only start after the body of that function is closed:
     * `eval(function(..){..}("DATA",76,"xneStqEMu",29,3,54))`
     */
    private fun unwrap(body: String): String? {
        val evalAt = body.indexOf("eval(")
        if (evalAt < 0) return null

        val fnStart = body.indexOf("function", evalAt + 5)
        if (fnStart < 0) return null
        val braceAt = body.indexOf('{', fnStart)
        if (braceAt < 0) return null
        val braceEnd = matchPair(body, braceAt, '{', '}') ?: return null
        val argEnd = matchPair(body, evalAt + 4, '(', ')') ?: return null
        val args = splitTopLevel(body.substring(braceEnd + 1, argEnd))
        if (args.size < 6) {
            Log.w(TAG, "unexpected decoder arity: ${args.size}")
            return null
        }

        val payload = args[0].trim('"')
        val table = args[2].trim('"')
        val offset = args[3].toIntOrNull() ?: return null
        val radix = args[4].toIntOrNull() ?: return null

        return runCatching { decodePayload(payload, table, offset, radix) }
            .onFailure { Log.w(TAG, "decode failed: ${it.message}") }
            .getOrNull()
    }

    private fun decodePayload(h: String, table: String, offset: Int, radix: Int): String {
        val separator = table.getOrNull(radix) ?: return ""
        val out = StringBuilder(h.length)
        var i = 0
        while (i < h.length) {
            val chunk = StringBuilder()
            while (i < h.length && h[i] != separator) {
                chunk.append(h[i]); i++
            }
            // The table characters are placeholders for the digit they stand for.
            var s = chunk.toString()
            for (j in table.indices) {
                s = s.replace(table[j].toString(), j.toString())
            }
            val value = readNumber(s, radix, 10)
            out.append(((value - offset) and 0xFFFF).toChar())
            i++ // step over the separator
        }
        return percentDecode(out.toString())
    }

    /**
     * Reads a number written the way the wrapper writes them: reversed digits in
     * base [radix], where any character outside `0..radix-1` is just filler.
     */
    private fun readNumber(s: String, radix: Int, outRadix: Int): Long {
        val inDigits = DIGITS.subList(0, minOf(radix, DIGITS.size))
        val outDigits = DIGITS.subList(0, minOf(outRadix, DIGITS.size))

        var acc = 0L
        var place = 1L
        for (k in s.indices.reversed()) {
            val d = inDigits.indexOf(s[k].toString())
            if (d >= 0) acc += d * place
            if (acc > READ_LIMIT) return 0
            place *= radix
            if (place > READ_LIMIT) return 0
        }

        if (acc <= 0L) return 0
        val sb = StringBuilder()
        var v = acc
        while (v > 0) {
            sb.insert(0, outDigits[(v % outRadix).toInt()])
            v = (v - (v % outRadix)) / outRadix
        }
        return sb.toString().toLongOrNull() ?: 0
    }

    /** The page runs `decodeURIComponent(escape(text))`; for ASCII text that is a no-op. */
    private fun percentDecode(s: String): String {
        if (!s.contains('%')) return s
        val out = StringBuilder(s.length)
        val bytes = ByteArrayOutputStream()
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (c == '%' && i + 2 < s.length) {
                val hex = s.substring(i + 1, i + 3)
                val b = hex.toIntOrNull(16)
                if (b != null) {
                    bytes.write(b); i += 3; continue
                }
            }
            if (bytes.size() > 0) { out.append(String(bytes.toByteArray(), StandardCharsets.UTF_8)); bytes.reset() }
            out.append(c); i++
        }
        if (bytes.size() > 0) out.append(String(bytes.toByteArray(), StandardCharsets.UTF_8))
        return out.toString()
    }

    // ------------------------------------------------------------------ parsing

    private fun matchPair(s: String, openAt: Int, open: Char, close: Char): Int? {
        var depth = 0
        var inStr = false
        var i = openAt
        while (i < s.length) {
            val c = s[i]
            if (inStr) {
                if (c == '\\') { i += 2; continue }
                if (c == '"') inStr = false
            } else {
                when (c) {
                    '"' -> inStr = true
                    open -> depth++
                    close -> { depth--; if (depth == 0) return i }
                }
            }
            i++
        }
        return null
    }

    private fun splitTopLevel(s: String): List<String> {
        val out = mutableListOf<String>()
        val cur = StringBuilder()
        var inStr = false
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (inStr) {
                cur.append(c)
                if (c == '\\' && i + 1 < s.length) { cur.append(s[i + 1]); i += 2; continue }
                if (c == '"') inStr = false
                i++
                continue
            }
            when (c) {
                '"' -> { inStr = true; cur.append(c) }
                ',' -> { out.add(cur.toString()); cur.clear() }
                else -> cur.append(c)
            }
            i++
        }
        out.add(cur.toString())
        return out
    }

    /** True when the wrapper's own expiry check would still pass. */
    private fun windowIsOpen(decoded: String): Boolean {
        val m = Regex("""Math\.round\(\+new Date\(\)/1000\)\)\s*<\s*(\d+)""").find(decoded) ?: return true
        val until = m.groupValues[1].toLongOrNull() ?: return true
        val now = System.currentTimeMillis() / 1000
        return until - now >= MIN_SECONDS_LEFT
    }

    /** Reads SnapSave's own failure text, when it reported one instead of results. */
    private fun readAlert(decoded: String): SnapSaveResult.Failed? {
        // SnapSave renders results into #download-section and problems into
        // #alert, so this is the one reliable way to tell the two apart.
        if (decoded.contains("download-section")) return null

        val alert = Regex("""querySelector\("#alert"\)\.innerHTML\s*=\s*\\?"(.*?)\\?";""").find(decoded)
        val code = Regex(""""error_code"\s*:\s*"([^"]+)"""").find(decoded)?.groupValues?.get(1).orEmpty()
        val text = alert?.groupValues?.get(1)
            ?.replace("\\'", "'")
            ?.replace("\\\"", "\"")
            ?.replace(Regex("<[^>]*>"), " ")
            ?.replace(Regex("\\s+"), " ")
            ?.trim()
            .orEmpty()

        val message = text.ifBlank {
            if (code.isNotBlank()) "SnapSave could not fetch this ($code)." else "SnapSave could not fetch this."
        }
        return SnapSaveResult.Failed(message, code.ifBlank { "unknown" })
    }

    private fun parse(decoded: String): SnapSaveResult {
        val thumbs = Regex("""$RAPID_HOST/thumb\?token=([A-Za-z0-9._\-]+)""").findAll(decoded).map { it.groupValues[1] }.toList()
        val vids = Regex("""$RAPID_HOST/v2\?token=([A-Za-z0-9._\-]+)""").findAll(decoded).map { it.groupValues[1] }.toList()

        if (vids.isEmpty()) {
            return SnapSaveResult.Failed("SnapSave returned no media for this link.", "no_media")
        }

        // Pair each thumbnail with the download that follows it, then drop repeats.
        val seen = LinkedHashMap<String, StoryMedia>()
        for ((i, token) in vids.withIndex()) {
            val payload = jwtPayload(token) ?: continue
            val real = payload.optString("url").substringBefore('?')
            if (real.isBlank()) continue
            val headers = payload.optJSONObject("headers")
            val ua = headers?.optString("user-agent").orEmpty().ifBlank { DESKTOP_UA }
            val name = payload.optString("filename").ifBlank { real.substringAfterLast('/') }
            val thumb = thumbs.getOrNull(i)?.let { "https://$RAPID_HOST/thumb?token=$it" }.orEmpty()

            val item = StoryMedia(
                id = real,
                downloadUrl = "https://$RAPID_HOST/v2?token=$token",
                thumbnailUrl = thumb,
                realUrl = real,
                filename = name,
                userAgent = ua,
                isImage = inferImage(real),
            )
            seen.putIfAbsent(real, item)
        }

        if (seen.isEmpty()) {
            return SnapSaveResult.Failed("SnapSave returned media we could not read.", "no_media")
        }

        // The rendered page carries no username or title (its `alt` text is a static
        // "Download Instagram SnapX" template), so the caller names the batch from
        // the URL it asked about.
        Log.d(TAG, "parsed ${seen.size} story items")
        return SnapSaveResult.Ok(seen.values.toList())
    }

    /**
     * Instagram's own CDN path already names the container: stills live under
     * t51/t52/t32 and clips under t2. Reading it saves a request per story.
     */
    private fun inferImage(realUrl: String): Boolean {
        val path = realUrl.substringBefore('?')
        if (Regex("""/t5[12][./]""").containsMatchIn(path)) return true
        if (path.contains("/t32/")) return true
        if (Regex("""/(o1/)?v/t2/""").containsMatchIn(path)) return false
        return realUrl.substringBefore('?').substringAfterLast('.', "").lowercase() in
            setOf("jpg", "jpeg", "png", "webp")
    }

    private fun jwtPayload(token: String): JSONObject? = try {
        val part = token.split('.')[1]
        val padded = part.padEnd((part.length + 3) / 4 * 4, '=')
        JSONObject(String(Base64.decode(padded, Base64.URL_SAFE or Base64.NO_WRAP), StandardCharsets.UTF_8))
    } catch (e: Exception) {
        Log.w(TAG, "bad token: ${e.message}")
        null
    }

    // ----------------------------------------------------------------- download

    /**
     * Streams one story to [dest]. Uses the user agent SnapSave signed the token
     * with; the CDN rejects the request otherwise.
     */
    fun download(media: StoryMedia, dest: java.io.File, timeoutMs: Int = 60_000): Boolean {
        return try {
            dest.parentFile?.mkdirs()
            val conn = URL(media.downloadUrl).openConnection() as HttpURLConnection
            try {
                conn.connectTimeout = timeoutMs
                conn.readTimeout = timeoutMs
                conn.instanceFollowRedirects = true
                conn.setRequestProperty("User-Agent", media.userAgent)
                conn.setRequestProperty("Referer", "https://snapsave.app/")
                if (conn.responseCode !in 200..299) {
                    Log.w(TAG, "download HTTP ${conn.responseCode} for ${media.filename}")
                    false
                } else {
                    BufferedInputStream(conn.inputStream).use { input ->
                        dest.outputStream().use { output -> input.copyTo(output, 64 * 1024) }
                    }
                    dest.length() > 0
                }
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            Log.e(TAG, "download failed for ${media.filename}", e)
            false
        }
    }

    /** Fetches a thumbnail for the in-app grid. False when none is available. */
    fun downloadThumbnail(media: StoryMedia, dest: java.io.File): Boolean {
        if (media.thumbnailUrl.isBlank()) return false
        return try {
            dest.parentFile?.mkdirs()
            val conn = URL(media.thumbnailUrl).openConnection() as HttpURLConnection
            try {
                conn.connectTimeout = 15_000
                conn.readTimeout = 15_000
                conn.setRequestProperty("User-Agent", media.userAgent)
                if (conn.responseCode !in 200..299) return false
                BufferedInputStream(conn.inputStream).use { input ->
                    dest.outputStream().use { output -> input.copyTo(output) }
                }
                dest.length() > 0
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            Log.w(TAG, "thumbnail failed: ${e.message}")
            false
        }
    }
}