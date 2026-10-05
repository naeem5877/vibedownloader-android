package com.vibedownloadermobile.ytdlp

import android.content.Context
import android.util.Log
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

/**
 * Metadata-only fast path that bypasses Python, Chaquopy and any JS runtime.
 *
 * Calls the InnerTube `player` endpoint with the VISIONOS client, which returns
 * playable `url` fields rather than `signatureCipher` blobs, so a typical
 * resolve costs a few hundred milliseconds instead of the ~15s a full yt-dlp
 * extraction takes on this device class.
 *
 * Three constraints are load-bearing and easy to undo by accident:
 *
 *  - VISIONOS is deliberate. ANDROID_VR, which most third-party InnerTube
 *    implementations still use, has had every media URL 403'd since Aug 2026.
 *  - `visitorData` is required. Without it YouTube answers LOGIN_REQUIRED for
 *    most videos, which looks exactly like a network failure.
 *  - Client versions rotate. [CACHE_VERSION] is part of every persisted key so
 *    that signed URLs and visitor tokens issued by a replaced client profile
 *    can never outlive it.
 *
 * Only metadata is resolved here. Downloading still goes through yt-dlp, because
 * progressive muxing and subtitle packaging are not implemented in this file.
 */
object InnerTubeResolver {

    private const val TAG = "InnerTubeResolver"

    private const val PLAYER_ENDPOINT = "https://youtubei.googleapis.com/youtubei/v1/player"
    private const val VISITOR_ENDPOINT = "https://youtubei.googleapis.com/youtubei/v1/visitor_id"

    private const val CLIENT_NAME = "VISIONOS"
    private const val CLIENT_VERSION = "1.02"
    private const val DEVICE_MAKE = "Apple"
    private const val DEVICE_MODEL = "RealityDevice17,1"
    private const val OS_NAME = "visionOS"
    private const val OS_VERSION = "26.5.23O471"

    /** Bump to invalidate persisted visitor tokens and signed URLs. */
    private const val CACHE_VERSION = "v1"

    private const val CONNECT_TIMEOUT_MS = 4_000
    private const val READ_TIMEOUT_MS = 6_000

    private const val USER_AGENT =
        "com.google.ios.youtube/20.10.4 (ApplevisionDevice; U; CPU visionOS 26_5 like Mac OS X)"

    data class Format(
        val formatId: String,
        val ext: String,
        val width: Int,
        val height: Int,
        val fps: Double,
        val vcodec: String,
        val acodec: String,
        val tbr: Double,
        val filesize: Double,
        val hasVideo: Boolean,
        val hasAudio: Boolean,
        val formatNote: String,
        val directUrl: String?,
        val expiresAtMillis: Long
    ) {
        val resolution: String get() = "${width}x$height"
    }

    data class Info(
        val id: String,
        val title: String,
        val author: String,
        val durationSeconds: Double,
        val viewCount: Double,
        val thumbnail: String,
        val isLive: Boolean,
        val formats: List<Format>,
        val subtitles: List<SubtitleTrack>,
        val audioTracks: List<AudioTrack>
    )

    private fun parseJson(text: String): JsonObject = JsonParser.parseString(text).asJsonObject

    @Volatile
    private var cachedVisitorData: String? = null

    private fun prefs(context: Context) =
        context.getSharedPreferences("innertube_fast_path", Context.MODE_PRIVATE)

    private fun postJson(context: Context, url: String, body: String): JsonObject? {
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("User-Agent", USER_AGENT)
            }
            cachedVisitorData?.let { connection.setRequestProperty("X-Goog-Visitor-Id", it) }
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

            val code = connection.responseCode
            if (code !in 200..299) {
                Log.w(TAG, "POST $url -> HTTP $code")
                return null
            }
            val text = connection.inputStream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
            if (text.isBlank()) null else parseJson(text)
        } catch (e: Exception) {
            Log.w(TAG, "POST $url failed: ${e.javaClass.simpleName}: ${e.message}")
            null
        } finally {
            connection?.disconnect()
        }
    }

    private fun clientJson(visitorData: String?): JsonObject {
        val client = JsonObject()
        client.addProperty("clientName", CLIENT_NAME)
        client.addProperty("clientVersion", CLIENT_VERSION)
        client.addProperty("deviceMake", DEVICE_MAKE)
        client.addProperty("deviceModel", DEVICE_MODEL)
        client.addProperty("osName", OS_NAME)
        client.addProperty("osVersion", OS_VERSION)
        client.addProperty("hl", "en")
        client.addProperty("gl", "US")
        visitorData?.let { client.addProperty("visitorData", it) }
        return client
    }

    /**
     * Bodies are assembled with Gson rather than string templates on purpose.
     *
     * A template broken across lines sends literal newlines inside the JSON, and
     * `POST /player` answers that with `400 Precondition check failed` while the
     * identical payload on a single line returns 200. That failure looks like a
     * rejected client profile, not a formatting problem, so it is worth keeping
     * this programmatic.
     */
    private fun visitorBody(): String = JsonObject().apply {
        add("context", JsonObject().apply { add("client", clientJson(null)) })
    }.toString()

    private fun playerBody(videoId: String, visitor: String?): String = JsonObject().apply {
        add("context", JsonObject().apply { add("client", clientJson(visitor)) })
        addProperty("videoId", videoId)
        addProperty("contentCheckOk", true)
        addProperty("racyCheckOk", true)
    }.toString()

    private suspend fun visitorData(context: Context): String? = withContext(Dispatchers.IO) {
        cachedVisitorData?.let { return@withContext it }

        val stored = prefs(context).getString("visitor_$CACHE_VERSION", null)
        if (!stored.isNullOrBlank()) {
            cachedVisitorData = stored
            return@withContext stored
        }

        val response = postJson(context, VISITOR_ENDPOINT, visitorBody()) ?: return@withContext null
        val token = response.getAsJsonObject("responseContext")
            ?.str("visitorData")
            ?.takeIf { it.isNotBlank() }
            ?: return@withContext null

        cachedVisitorData = token
        prefs(context).edit().putString("visitor_$CACHE_VERSION", token).apply()
        Log.d(TAG, "visitorData refreshed (${token.length} chars)")
        token
    }

    private fun selectThumbnail(thumbnails: Iterable<JsonElement>?): String {
        if (thumbnails == null) return ""
        var bestUrl = ""
        var bestArea = -1L
        thumbnails.forEach { element ->
            if (!element.isJsonObject) return@forEach
            val thumb = element.asJsonObject
            val url = thumb.str("url")
            if (url.isBlank() || url.contains("default")) return@forEach
            val width = thumb.num("width") ?: 0.0
            val height = thumb.num("height") ?: 0.0
            val area = (width * height).toLong()
            if (area > bestArea) {
                bestArea = area
                bestUrl = url
            }
        }
        return bestUrl
    }

    private fun parseFormat(
        element: com.google.gson.JsonElement,
        nowMillis: Long
    ): Format? {
        if (!element.isJsonObject) return null
        val node = element.asJsonObject

        val itag = node.get("itag")?.takeIf { it.isJsonPrimitive }?.asString ?: return null
        val mimeType = node.str("mimeType")
        if (mimeType.isBlank()) return null

        val kind = mimeType.substringBefore('/')
        val subtype = mimeType.substringAfter('/').substringBefore(';').lowercase()
        val ext = when {
            subtype.contains("mp4") -> if (kind == "audio") "m4a" else "mp4"
            subtype.contains("webm") -> "webm"
            else -> return null
        }

        val directUrl = node.get("url")?.takeIf { it.isJsonPrimitive }?.asString
        val ciphered = node.get("signatureCipher")?.takeIf { it.isJsonPrimitive }?.asString
        if (ciphered != null && directUrl == null) {
            Log.d(TAG, "format $itag still ciphered, skipping")
            return null
        }

        val codec = mimeType.substringAfter("codecs=", "").substringBefore(",").trim()
        val hasVideo = kind == "video"
        val hasAudio = kind == "audio"
        val qualityLabel = node.str("qualityLabel")

        val width = (node.num("width") ?: 0.0).toInt()
        val height = (node.num("height") ?: 0.0).toInt()

        val expiresInSeconds = (node.num("expiresInSeconds") ?: 0.0).toLong()
        val expiresAt = if (expiresInSeconds > 0) {
            nowMillis + (expiresInSeconds - 60).coerceAtLeast(30) * 1000L
        } else {
            0L
        }

        val note = when {
            qualityLabel.isNotBlank() -> qualityLabel
            node.get("audioQuality")?.takeIf { it.isJsonPrimitive }?.asString == "AUDIO_QUALITY_MEDIUM" -> "Medium"
            else -> ""
        }

        return Format(
            formatId = itag,
            ext = ext,
            width = width,
            height = height,
            fps = node.num("fps") ?: 0.0,
            vcodec = if (hasVideo) codec.ifBlank { "unknown" } else "none",
            acodec = if (hasAudio) codec.ifBlank { "unknown" } else "none",
            tbr = (node.num("bitrate") ?: 0.0) / 1000.0,
            filesize = node.num("contentLength") ?: 0.0,
            hasVideo = hasVideo,
            hasAudio = hasAudio,
            formatNote = note,
            directUrl = directUrl,
            expiresAtMillis = expiresAt
        )
    }

    /**
     * Caption tracks, keyed and labelled exactly as [buildSubtitleTracks] does so
     * both extraction paths feed the picker identical data.
     *
     * `kind == "asr"` is YouTube's auto-generated marker. Everything else is
     * treated as author uploaded, which is the same rule yt-dlp applies when it
     * splits `subtitles` from `automatic_captions`.
     *
     * A language can appear twice (for example two English tracks). The picker
     * keys on language, so the first is kept rather than emitting a duplicate
     * the user cannot tell apart.
     */
    private fun parseSubtitles(root: JsonObject): List<SubtitleTrack> {
        val array = root.getAsJsonObject("captions")
            ?.getAsJsonObject("playerCaptionsTracklistRenderer")
            ?.get("captionTracks")
            ?.takeIf { it.isJsonArray }
            ?.asJsonArray
            ?: return emptyList()

        val out = LinkedHashMap<String, SubtitleTrack>()
        array.forEach { element ->
            if (!element.isJsonObject) return@forEach
            val node = element.asJsonObject
            val lang = node.str("languageCode")
            if (lang.isBlank()) return@forEach

            val isAuto = node.str("kind") == "asr"
            val key = "${if (isAuto) "auto" else "manual"}:$lang"
            if (out.containsKey(key)) return@forEach

            val label = languageLabel(lang)
            out[key] = SubtitleTrack(
                key = key,
                lang = lang,
                label = if (isAuto) "$label (auto)" else label,
                langLabel = label,
                isAuto = isAuto,
                // Only vtt is served directly. The picker still offers srt and
                // downloadSubtitles converts through yt-dlp's --sub-format.
                formats = listOf("vtt"),
            )
        }

        return out.values.sortedWith(
            compareBy<SubtitleTrack> { it.langLabel.lowercase(Locale.ROOT) }.thenBy { it.lang }
        )
    }

    private val LANGUAGE_TAG = Regex("[a-z]{2,3}(-[A-Za-z]{2,4})?")

    /**
     * Best-effort language tag for a per-language audio stream.
     *
     * InnerTube identifies these by `audioTrack.id`, which is a locale-ish tag
     * with a suffix (`en.4`, `hi.3`) rather than a clean BCP-47 code, and by a
     * human `displayName`. The tag is preferred and the display name is the
     * fallback, which [languageLabel] passes through unchanged if it cannot
     * resolve it, so a track is never dropped over a missing label.
     */
    private fun languageOfAudioTrack(node: JsonObject): String {
        val head = node.str("id").substringBefore('.').substringBefore('_').lowercase(Locale.ROOT)
        if (LANGUAGE_TAG.matches(head)) return head
        return node.str("displayName").trim().ifBlank { "und" }
    }

    /**
     * One entry per audio language, original first. Returns empty unless the
     * video publishes more than one, which is what keeps the picker hidden for
     * the single-language videos that are the overwhelming majority.
     */
    private fun parseAudioTracks(streamingData: JsonObject?): List<AudioTrack> {
        val adaptive = streamingData?.get("adaptiveFormats")
            ?.takeIf { it.isJsonArray }
            ?.asJsonArray
            ?: return emptyList()

        data class Candidate(val node: JsonObject, val lang: String, val mime: String)

        val candidates = mutableListOf<Candidate>()
        adaptive.forEach { element ->
            if (!element.isJsonObject) return@forEach
            val node = element.asJsonObject
            val mime = node.str("mimeType")
            if (!mime.startsWith("audio/")) return@forEach
            if (node.str("url").isBlank()) return@forEach
            val audioTrack = node.getAsJsonObject("audioTrack") ?: return@forEach
            candidates.add(Candidate(node, languageOfAudioTrack(audioTrack), mime))
        }
        if (candidates.isEmpty()) return emptyList()

        val languages = candidates.map { it.lang }.toSet()
        if (languages.size < 2) return emptyList()

        val tracks = candidates.groupBy { it.lang }.map { (lang, ofLang) ->
            // AAC first: downloads are muxed to MP4, so an Opus stream would
            // have to be re-encoded while AAC does not.
            val best = ofLang.minByOrNull { if (it.mime.startsWith("audio/mp4")) 0 else 1 }!!
            val node = best.node
            val audioTrack = node.getAsJsonObject("audioTrack")!!
            val isOriginal = audioTrack.bool("audioIsDefault") == true ||
                audioTrack.str("audioTrackType") == "AUDIO_TRACK_TYPE_ORIGINAL"
            val bitrate = node.num("bitrate")?.let { Math.round(it / 1000.0).toInt() } ?: 0

            AudioTrack(
                key = "audio:$lang",
                lang = lang,
                langLabel = languageLabel(lang),
                isOriginal = isOriginal,
                formatId = node.get("itag")?.asString.orEmpty(),
                ext = if (best.mime.startsWith("audio/mp4")) "m4a" else "webm",
                acodec = node.str("mimeType")
                    .substringAfter("codecs=", "")
                    .substringBefore(",")
                    .trim()
                    .ifBlank { "unknown" },
                abr = bitrate,
            )
        }

        if (tracks.size < 2) return emptyList()

        return tracks.sortedWith(
            compareByDescending<AudioTrack> { it.isOriginal }
                .thenBy { it.langLabel.lowercase(Locale.ROOT) }
        )
    }

    private fun parseInfo(root: JsonObject, videoId: String, nowMillis: Long): Info? {
        val status = root.getAsJsonObject("playabilityStatus")
            ?.get("status")
            ?.takeIf { it.isJsonPrimitive }
            ?.asString

        if (status != null && status != "OK") return null

        val videoDetails = root.getAsJsonObject("videoDetails")
        val streamingData = root.getAsJsonObject("streamingData")
        if (streamingData == null) return null

        val seen = HashSet<String>()
        val formats = ArrayList<Format>()
        listOf("formats", "adaptiveFormats").forEach { key ->
            val array = streamingData.get(key)
            if (array == null || !array.isJsonArray) return@forEach
            array.asJsonArray.forEach { element ->
                val format = parseFormat(element, nowMillis) ?: return@forEach
                if (seen.add(format.formatId)) formats.add(format)
            }
        }
        if (formats.isEmpty()) return null

        // videoDetails.thumbnail is an object wrapping a "thumbnails" array, the same
        // shape yt-dlp surfaces, not an array itself.
        val thumbnails = videoDetails
            ?.getAsJsonObject("thumbnail")
            ?.getAsJsonArray("thumbnails")

        return Info(
            id = videoId,
            title = videoDetails?.str("title")?.ifBlank { null } ?: "Untitled",
            author = videoDetails?.str("author")?.ifBlank { null } ?: "Unknown",
            durationSeconds = videoDetails?.num("lengthSeconds") ?: 0.0,
            viewCount = (videoDetails?.str("viewCount")?.replace(",", "")?.toDoubleOrNull() ?: 0.0),
            thumbnail = selectThumbnail(thumbnails),
            isLive = videoDetails?.get("isLive")?.asBoolean ?: false,
            formats = formats,
            subtitles = parseSubtitles(root),
            audioTracks = parseAudioTracks(streamingData)
        )
    }

    private suspend fun requestPlayer(
        context: Context,
        videoId: String,
        visitor: String?
    ): Info? = withContext(Dispatchers.IO) {
        val root = postJson(context, PLAYER_ENDPOINT, playerBody(videoId, visitor))
            ?: return@withContext null
        parseInfo(root, videoId, System.currentTimeMillis())
    }

    /**
     * Resolves metadata for [videoId], or null when the fast path cannot serve
     * this request and the caller should fall back to yt-dlp. Never throws.
     */
    suspend fun resolve(context: Context, videoId: String): Info? {
        val startedAt = System.currentTimeMillis()
        return try {
            var visitor = visitorData(context)
            var info = requestPlayer(context, videoId, visitor)

            if (info == null) {
                cachedVisitorData = null
                prefs(context).edit().remove("visitor_$CACHE_VERSION").apply()
                visitor = visitorData(context)
                info = requestPlayer(context, videoId, visitor)
            }

            if (info == null) {
                Log.d(TAG, "resolve $videoId -> fallback (${System.currentTimeMillis() - startedAt}ms)")
            } else {
                Log.d(
                    TAG,
                    "resolve $videoId ok in ${System.currentTimeMillis() - startedAt}ms " +
                        "formats=${info.formats.size} subs=${info.subtitles.size} " +
                        "audioTracks=${info.audioTracks.size} live=${info.isLive}"
                )
            }
            info
        } catch (e: Exception) {
            Log.w(TAG, "resolve $videoId threw: ${e.javaClass.simpleName}: ${e.message}", e)
            null
        }
    }

    fun extractVideoId(url: String): String? {
        val trimmed = url.trim()
        if (trimmed.isBlank()) return null
        Regex("""youtu\.be/([A-Za-z0-9_-]{11})""").find(trimmed)?.let {
            return it.groupValues[1]
        }
        Regex("""[?&]v=([A-Za-z0-9_-]{11})""").find(trimmed)?.let {
            return it.groupValues[1]
        }
        Regex("""/embed/([A-Za-z0-9_-]{11})""").find(trimmed)?.let {
            return it.groupValues[1]
        }
        Regex("""/shorts/([A-Za-z0-9_-]{11})""").find(trimmed)?.let {
            return it.groupValues[1]
        }
        Regex("""/(?:v|live)/([A-Za-z0-9_-]{11})""").find(trimmed)?.let {
            return it.groupValues[1]
        }
        return Regex("""^([A-Za-z0-9_-]{11})$""").find(trimmed)?.groupValues?.get(1)
    }

    /** Direct URL for a format resolved earlier, if it has not expired. */
    fun directUrl(info: Info, formatId: String): String? {
        val format = info.formats.firstOrNull { it.formatId == formatId } ?: return null
        val url = format.directUrl ?: return null
        val expiresAt = format.expiresAtMillis
        if (expiresAt in 1..System.currentTimeMillis()) return null
        return url
    }

    fun bestThumbnail(info: Info): String = info.thumbnail

    internal fun resetForTests() {
        cachedVisitorData = null
    }
}