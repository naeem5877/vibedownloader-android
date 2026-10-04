package com.vibedownloadermobile.ytdlp

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import java.util.Locale

/**
 * Subtitle and audio-track metadata extracted straight from yt-dlp's raw JSON.
 *
 * The bundled youtubedl-android `VideoInfo` model deliberately drops the
 * `subtitles` / `automatic_captions` dictionaries and the per-format `language`
 * field, so these helpers read the `JsonObject` returned by
 * `YoutubeDL.execute(...)` instead. Shapes mirror the desktop app so both
 * clients present identical pickers.
 */
data class SubtitleTrack(
    val key: String,
    val lang: String,
    val label: String,
    val langLabel: String,
    val isAuto: Boolean,
    val formats: List<String>,
)

data class AudioTrack(
    val key: String,
    val lang: String,
    val langLabel: String,
    val isOriginal: Boolean,
    val formatId: String,
    val ext: String,
    val acodec: String,
    val abr: Int,
)

/**
 * Codes `Intl.DisplayNames` cannot name on desktop, carried over verbatim so a
 * track reads the same on both platforms. Everything else resolves through ICU.
 */
private val UNLABELLED_LANGUAGES = mapOf(
    "ab" to "Abkhaz",
    "aa" to "Afar",
    "ba" to "Bashkir",
    "dz" to "Dzongkha",
    "fj" to "Fijian",
    "gaa" to "Ga",
    "iu" to "Inuktitut",
    "kl" to "Kalaallisut",
    "kha" to "Khasi",
    "lua" to "Luba-Lulua",
    "luo" to "Luo",
    "gv" to "Manx",
    "mfe" to "Mauritian Creole",
    "new" to "Nepal Bhasa",
    "os" to "Ossetian",
    "pam" to "Pampanga",
    "rn" to "Rundi",
    "sg" to "Sango",
    "crs" to "Cree",
    "ss" to "Swati",
    "bo" to "Tibetan",
    "tum" to "Tumbuka",
    "ve" to "Venda",
    "war" to "Waray",
)

/**
 * Readable names for the script subtags that actually appear in caption tags.
 * Android ships no `java.util.Script`, so the handful that matter are listed.
 */
private val SCRIPT_NAMES = mapOf(
    "Hans" to "Simplified",
    "Hant" to "Traditional",
    "Latn" to "Latin",
    "Cyrl" to "Cyrillic",
    "Arab" to "Arabic",
    "Hebr" to "Hebrew",
    "Grek" to "Greek",
    "Deva" to "Devanagari",
    "Jpan" to "Japanese",
    "Kore" to "Korean",
    "Thai" to "Thai",
    "Armn" to "Armenian",
    "Geor" to "Georgian",
    "Ethi" to "Ethiopic",
)

/**
 * Human name for a language tag, e.g. `zh-Hans` -> "Chinese (Simplified)".
 * Falls back to the raw code rather than hiding the track, so every published
 * language stays selectable.
 */
fun languageLabel(lang: String): String {
    if (lang.isBlank()) return ""
    UNLABELLED_LANGUAGES[lang.lowercase(Locale.ROOT)]?.let { return it }

    return try {
        val locale = Locale.forLanguageTag(lang)
        val language = locale.getDisplayLanguage(Locale.ENGLISH)
        val script = locale.script

        when {
            language.isBlank() || language.equals(lang, ignoreCase = true) -> lang
            script.isBlank() -> language
            // ICU has no combined display name for a script subtag, so spell it
            // out: "Chinese (Simplified)" reads clearly beside the plain names.
            else -> SCRIPT_NAMES[script]?.let { "$language ($it)" } ?: language
        }
    } catch (e: Exception) {
        lang
    }
}

fun JsonObject.str(key: String): String =
    get(key)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString ?: ""

/** Numeric value, or `null` when absent or unparseable. Absent matters below. */
fun JsonObject.num(key: String): Double? {
    val el = get(key) ?: return null
    if (!el.isJsonPrimitive) return null
    val primitive = el.asJsonPrimitive
    return when {
        primitive.isNumber -> primitive.asDouble
        primitive.isString -> primitive.asString.trim().toDoubleOrNull()
        else -> null
    }
}

/** The `live_chat` pseudo-track is a chat log, not a subtitle of the audio. */
private fun isRealCaptionLang(lang: String): Boolean =
    !lang.contains("live_chat", ignoreCase = true)

/**
 * Every caption track this video publishes, author-uploaded first because those
 * are the accurate ones, then all of YouTube's automatic and translated tracks.
 * A language present in both dicts is listed twice on purpose: the author's own
 * track and YouTube's machine translation of it are different files.
 */
fun buildSubtitleTracks(root: JsonObject?): List<SubtitleTrack> {
    if (root == null) return emptyList()
    val out = mutableListOf<SubtitleTrack>()

    fun collect(dictionaryKey: String, isAuto: Boolean) {
        val dictionary = root.get(dictionaryKey)
        if (dictionary == null || !dictionary.isJsonObject) return

        dictionary.asJsonObject.entrySet().forEach { (lang, value) ->
            if (!isRealCaptionLang(lang)) return@forEach

            val formats = if (!value.isJsonArray) emptyList() else value.asJsonArray
                .filter { it.isJsonObject }
                .map { it.asJsonObject.str("ext") }
                .filter { it.isNotBlank() }

            val label = languageLabel(lang)
            out.add(
                SubtitleTrack(
                    key = "${if (isAuto) "auto" else "manual"}:$lang",
                    lang = lang,
                    label = if (isAuto) "$label (auto)" else label,
                    langLabel = label,
                    isAuto = isAuto,
                    formats = formats,
                )
            )
        }
    }

    collect("subtitles", isAuto = false)
    collect("automatic_captions", isAuto = true)

    return out.sortedWith(
        compareBy<SubtitleTrack> { it.langLabel.lowercase(Locale.ROOT) }.thenBy { it.lang }
    )
}

/**
 * An audio-only format that can be requested directly with `-f <formatId>`.
 */
private fun isSelectableAudioFormat(format: JsonObject): Boolean {
    // HLS variants carry video and audio in one manifest, so they cannot be
    // paired with a separately chosen video format.
    val protocol = format.str("protocol")
    if (protocol.isNotBlank() && protocol != "https") return false
    if (format.str("format_id").isBlank()) return false
    if (format.str("vcodec") != "none") return false
    val acodec = format.str("acodec")
    if (acodec.isBlank() || acodec == "none") return false
    // Dubbed tracks always carry a language; single-language sources do not
    // need to be looked at twice.
    return format.str("language").isNotBlank()
}

/**
 * AAC is preferred over Opus because media downloads are muxed to MP4, and an
 * Opus stream has to be re-encoded on the way in while AAC does not. Only when
 * a language publishes no AAC at all do we fall back to Opus.
 */
private fun codecRank(acodec: String): Int = when {
    acodec.startsWith("mp4a", ignoreCase = true) -> 0
    acodec.contains("opus", ignoreCase = true) -> 1
    else -> 2
}

private fun bitrateOf(format: JsonObject): Int {
    val abr = format.num("abr") ?: format.num("tbr") ?: 0.0
    return Math.round(if (abr.isNaN() || abr.isInfinite()) 0.0 else abr).toInt()
}

/**
 * The original track is the one YouTube marks as default, reported two ways
 * depending on the video: a `language_preference` of 10, and the wording in the
 * format note. An absent `language_preference` means "not marked", so it must
 * not be treated as zero.
 */
private fun isOriginalFormat(format: JsonObject): Boolean {
    val preference = format.num("language_preference")
    if (preference != null && !preference.isNaN() && preference >= 0) return true
    return ORIGINAL_NOTE.containsMatchIn(format.str("format_note"))
}

private val ORIGINAL_NOTE = Regex("\\boriginal\\b|\\bdefault\\b", RegexOption.IGNORE_CASE)

/**
 * One entry per audio language, original first so the default selection is the
 * language the video was recorded in, then alphabetical.
 *
 * Returns an empty list unless the video publishes more than one audio language.
 * That is what keeps the picker out of the UI for the overwhelming majority of
 * videos, which have a single audio track and nothing to offer.
 */
fun buildAudioTracks(formats: JsonArray?): List<AudioTrack> {
    if (formats == null || !formats.isJsonArray) return emptyList()

    val candidates = formats.filter { it.isJsonObject }.map { it.asJsonObject }
        .filter { isSelectableAudioFormat(it) }
    if (candidates.isEmpty()) return emptyList()

    val languages = candidates.map { it.str("language") }.toSet()
    if (languages.size < 2) return emptyList()

    val tracks = candidates.groupBy { it.str("language") }.map { (lang, ofLang) ->
        var best = ofLang[0]
        for (format in ofLang.drop(1)) {
            val challenger = codecRank(format.str("acodec"))
            val incumbent = codecRank(best.str("acodec"))
            val better = challenger < incumbent ||
                (challenger == incumbent && bitrateOf(format) > bitrateOf(best))
            if (better) best = format
        }

        AudioTrack(
            key = "audio:$lang",
            lang = lang,
            langLabel = languageLabel(lang),
            isOriginal = isOriginalFormat(best),
            formatId = best.str("format_id"),
            ext = best.str("ext"),
            acodec = best.str("acodec"),
            abr = bitrateOf(best),
        )
    }

    if (tracks.size < 2) return emptyList()

    return tracks.sortedWith(
        compareByDescending<AudioTrack> { it.isOriginal }
            .thenBy { it.langLabel.lowercase(Locale.ROOT) }
    )
}

/** Strips characters that are unsafe in a MediaStore display name. */
fun safeFileStem(raw: String): String {
    val cleaned = raw.trim()
        .replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001F]"), "")
        .replace(Regex("\\s+"), " ")
        .trim('.', ' ')
    val limited = if (cleaned.length > 80) cleaned.substring(0, 80).trim() else cleaned
    return limited.ifBlank { "vibe" }
}
