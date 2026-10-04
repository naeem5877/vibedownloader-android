package com.vibedownloadermobile.story

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.vibedownloadermobile.cookie.CookieModule
import com.vibedownloadermobile.storage.MediaStorePublisher
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * StoryModule - fetches and downloads Instagram & Facebook stories.
 *
 * Story media comes from SnapSave (see [SnapSaveClient]) because Instagram's
 * own endpoints need a login and yt-dlp no longer resolves stories for most
 * public accounts. yt-dlp is still used for anything SnapSave hands back as a
 * page rather than a file.
 */
class StoryModule(
    reactContext: ReactApplicationContext,
    private val cookieModule: CookieModule
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "StoryModule"
        const val TAG = "StoryModule"

        private const val MOBILE_UA =
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
                "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = NAME

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Fetch stories for a platform username.
     *
     * Stories go through SnapSave, which is the only source that still returns
     * media for public accounts without a login. Cookies are passed along when
     * present (they are what make private accounts work) but are no longer
     * required. yt-dlp is kept as a fallback because it occasionally resolves
     * accounts SnapSave rejects.
     */
    @ReactMethod
    fun fetchStories(platform: String, username: String, promise: Promise) {
        scope.launch {
            try {
                Log.d(TAG, "Fetching stories for $platform: $username")

                val cookiePath = cookieModule.getCookieFilePath(platform.lowercase())
                val hasCookies = File(cookiePath).exists() && File(cookiePath).length() > 100
                val cookies = if (hasCookies) {
                    buildCookieHeaderFromFile(cookiePath, platform.lowercase())
                } else {
                    null
                }

                val target = buildStoryTargetUrl(platform, username)
                val result = SnapSaveClient.fetch(target, cookies)

                val stories = when (result) {
                    is SnapSaveResult.Ok -> result.items.mapIndexed { index, media ->
                        JSONObject().apply {
                            put("id", media.id)
                            // The download goes through SnapSave's CDN, not Instagram's.
                            put("url", media.downloadUrl)
                            put("thumbnail", media.thumbnailUrl)
                            put("type", if (media.isImage) "image" else "video")
                            put("username", username)
                            put("platform", platform)
                            put("title", storyTitle(platform, username, media, index))
                        }
                    }

                    is SnapSaveResult.Failed -> {
                        Log.w(TAG, "SnapSave refused $target: ${result.message} (${result.code})")
                        emptyList()
                    }
                }

                if (stories.isEmpty()) {
                    val fallback = try {
                        when (platform.lowercase()) {
                            "instagram" -> if (hasCookies) fetchInstagramStories(username, cookiePath) else emptyList()
                            "facebook" -> if (hasCookies) fetchFacebookStories(username, cookiePath) else emptyList()
                            else -> emptyList()
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "fallback failed", e)
                        emptyList()
                    }
                    if (fallback.isNotEmpty()) {
                        withContext(Dispatchers.Main) { promise.resolve(toNativeArray(fallback, platform, username)) }
                        return@launch
                    }
                    val detail = if (platform.equals("facebook", ignoreCase = true)) {
                        // SnapSave refuses Facebook outright, so yt-dlp with Facebook
                        // cookies is the only route and its raw message is not useful.
                        if (hasCookies) {
                            "Facebook would not serve that story even while signed in. " +
                                "Copy the story link again and check that your Facebook cookies are current."
                        } else {
                            "Facebook stories need you to be signed in. Log in to Facebook inside the " +
                                "app so your cookies are saved, then paste the story link again."
                        }
                    } else {
                        (result as? SnapSaveResult.Failed)?.message
                            ?: "No stories are available for $username right now."
                    }
                    withContext(Dispatchers.Main) {
                        promise.reject("NO_STORIES", detail)
                    }
                    return@launch
                }

                withContext(Dispatchers.Main) {
                    promise.resolve(toNativeArray(stories, platform, username))
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to fetch stories", e)
                withContext(Dispatchers.Main) {
                    promise.reject("FETCH_ERROR", "Failed to fetch stories: ${e.message}")
                }
            }
        }
    }

    private fun toNativeArray(
        stories: List<JSONObject>,
        platform: String,
        username: String,
    ): WritableNativeArray {
        val result = WritableNativeArray()
        for (story in stories) {
            val storyMap = WritableNativeMap().apply {
                putString("id", story.optString("id", ""))
                putString("url", story.optString("url", ""))
                putString("thumbnail", story.optString("thumbnail", ""))
                putString("type", story.optString("type", "video"))
                putDouble("timestamp", story.optDouble("timestamp", 0.0))
                putString("username", username)
                putString("platform", platform)
                putDouble("duration", story.optDouble("duration", 0.0))
                putString("title", story.optString("title", "Story"))
            }
            result.pushMap(storyMap)
        }
        return result
    }

    /**
     * Builds the page SnapSave is asked to read. Instagram accepts a bare
     * handle; Facebook needs the full story permalink, so an id is required
     * there and a bare profile name is rejected up front with a clear message.
     */
    private fun buildStoryTargetUrl(platform: String, username: String): String {
        val clean = username.trim().trimEnd('/')
        val lastSegment = clean.substringAfterLast('/')
        val storyId = lastSegment.substringAfter('-', "")

        return when (platform.lowercase()) {
            "instagram" -> "https://www.instagram.com/stories/${lastSegment}/"
            "facebook" -> when {
                // Story-tray permalink as copied from the Facebook app/web:
                //   facebook.com/stories/<page_id>/<opaque_story_id>/
                // Keep the two path segments intact, dropping any query string.
                clean.startsWith("stories/") -> {
                    val path = clean.substringBefore('?').trimEnd('/')
                    "https://www.facebook.com/$path/"
                }
                clean.contains("/stories/") -> "https://www.facebook.com/${clean.substringBefore('?').trimEnd('/')}/"
                storyId.isNotBlank() ->
                    "https://www.facebook.com/${clean.substringBeforeLast('/')}/stories/$storyId/"
                else -> throw IllegalArgumentException(
                    "Facebook stories need a full story link, for example " +
                        "facebook.com/username/stories/1234567890/"
                )
            }
            else -> throw IllegalArgumentException("Story fetching is not supported for $platform")
        }
    }

    private fun storyTitle(
        platform: String,
        username: String,
        media: StoryMedia,
        index: Int,
    ): String {
        val kind = if (media.isImage) "Photo" else "Video"
        val safe = username.trim().trimEnd('/').substringAfterLast('/')
        return "$safe $kind ${index + 1}"
    }

    private fun fetchInstagramStories(username: String, cookiePath: String): List<JSONObject> {
        val stories = mutableListOf<JSONObject>()

        // Strategy 1: Try yt-dlp with cookies
        try {
            Log.d(TAG, "Trying yt-dlp for Instagram stories: $username")
            val profileUrl = "https://www.instagram.com/$username/"
            val request = YoutubeDLRequest(profileUrl)
            request.addOption("--cookies", cookiePath)
            request.addOption("--dump-single-json")
            request.addOption("--flat-playlist")
            request.addOption("--no-check-certificate")
            request.addOption("--user-agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
            request.addOption("--add-header", "Accept-Language:en-US,en;q=0.9")

            val response = YoutubeDL.getInstance().execute(request)
            val json = JSONObject(response.out)
            
            val entries = json.optJSONArray("entries")
            if (entries != null && entries.length() > 0) {
                for (i in 0 until entries.length()) {
                    val entry = entries.getJSONObject(i)
                    val extractor = entry.optString("ie_key", "").lowercase()
                    // Filter for stories (Instagram story extractor)
                    if (extractor.contains("story") || entry.optString("webpage_url", "").contains("/stories/")) {
                        stories.add(parseYtDlpEntry(entry))
                    }
                }
            }

            if (stories.isNotEmpty()) {
                Log.d(TAG, "yt-dlp found ${stories.size} stories")
                return stories
            }
        } catch (e: Exception) {
            Log.w(TAG, "yt-dlp approach failed: ${e.message}")
        }

        // Strategy 2: Try direct Instagram story URL with yt-dlp
        try {
            val storyUrl = "https://www.instagram.com/stories/$username/"
            val request = YoutubeDLRequest(storyUrl)
            request.addOption("--cookies", cookiePath)
            request.addOption("--dump-single-json")
            request.addOption("--no-check-certificate")
            request.addOption("--user-agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")

            val response = YoutubeDL.getInstance().execute(request)
            val json = JSONObject(response.out)
            
            // Check if this is a playlist or single
            val entries = json.optJSONArray("entries")
            if (entries != null) {
                for (i in 0 until entries.length()) {
                    stories.add(parseYtDlpEntry(entries.getJSONObject(i)))
                }
            } else {
                stories.add(parseYtDlpEntry(json))
            }

            if (stories.isNotEmpty()) {
                Log.d(TAG, "Direct story URL found ${stories.size} stories")
                return stories
            }
        } catch (e: Exception) {
            Log.w(TAG, "Direct story URL failed: ${e.message}")
        }

        // Strategy 3: Instagram API approach via HTTP scraping
        return fetchInstagramStoriesViaApi(username, cookiePath)
    }

    private fun fetchInstagramStoriesViaApi(username: String, cookiePath: String): List<JSONObject> {
        val stories = mutableListOf<JSONObject>()
        
        try {
            // Read cookies from file
            val cookieString = buildCookieHeaderFromFile(cookiePath, ".instagram.com")
            
            if (cookieString.isEmpty()) {
                Log.w(TAG, "No Instagram cookies found to make API request")
                return stories
            }

            // First get the user ID
            val profileUrl = "https://www.instagram.com/api/v1/users/web_profile_info/?username=$username"
            val userInfoConn = URL(profileUrl).openConnection() as HttpURLConnection
            userInfoConn.apply {
                requestMethod = "GET"
                setRequestProperty("Cookie", cookieString)
                setRequestProperty("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15")
                setRequestProperty("X-IG-App-ID", "936619743392459")
                setRequestProperty("X-Requested-With", "XMLHttpRequest")
                setRequestProperty("Referer", "https://www.instagram.com/$username/")
                connectTimeout = 15000
                readTimeout = 15000
            }

            val responseCode = userInfoConn.responseCode
            if (responseCode != 200) {
                Log.w(TAG, "Instagram profile API returned: $responseCode")
                return stories
            }

            val profileJson = JSONObject(userInfoConn.inputStream.bufferedReader().readText())
            val userId = profileJson
                .optJSONObject("data")
                ?.optJSONObject("user")
                ?.optString("id") ?: return stories

            Log.d(TAG, "Got Instagram user ID: $userId")

            // Fetch stories for this user
            val storiesUrl = "https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=$userId"
            val storiesConn = URL(storiesUrl).openConnection() as HttpURLConnection
            storiesConn.apply {
                requestMethod = "GET"
                setRequestProperty("Cookie", cookieString)
                setRequestProperty("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15")
                setRequestProperty("X-IG-App-ID", "936619743392459")
                setRequestProperty("X-CSRFToken", extractCsrfToken(cookieString))
                setRequestProperty("Referer", "https://www.instagram.com/stories/$username/")
                connectTimeout = 15000
                readTimeout = 15000
            }

            val storiesResponse = storiesConn.inputStream.bufferedReader().readText()
            val storiesJson = JSONObject(storiesResponse)

            val reels = storiesJson.optJSONObject("reels_media") ?: return stories
            val reel = reels.optJSONObject(userId) ?: return stories
            val items = reel.optJSONArray("items") ?: return stories

            for (i in 0 until items.length()) {
                val item = items.getJSONObject(i)
                val storyObj = JSONObject()

                storyObj.put("id", item.optString("pk", "story_$i"))
                storyObj.put("timestamp", item.optDouble("taken_at", 0.0))
                storyObj.put("username", username)

                val mediaType = item.optInt("media_type", 1)
                if (mediaType == 2) {
                    // Video
                    storyObj.put("type", "video")
                    val videoVersions = item.optJSONArray("video_versions")
                    if (videoVersions != null && videoVersions.length() > 0) {
                        storyObj.put("url", videoVersions.getJSONObject(0).optString("url"))
                    }
                    storyObj.put("duration", item.optDouble("video_duration", 15.0))
                    
                    val imageVersions = item.optJSONObject("image_versions2")
                    val candidates = imageVersions?.optJSONArray("candidates")
                    if (candidates != null && candidates.length() > 0) {
                        storyObj.put("thumbnail", candidates.getJSONObject(0).optString("url"))
                    }
                } else {
                    // Image
                    storyObj.put("type", "image")
                    val imageVersions = item.optJSONObject("image_versions2")
                    val candidates = imageVersions?.optJSONArray("candidates")
                    if (candidates != null && candidates.length() > 0) {
                        val firstCandidate = candidates.getJSONObject(0).optString("url")
                        storyObj.put("url", firstCandidate)
                        storyObj.put("thumbnail", firstCandidate)
                    }
                    storyObj.put("duration", 0.0)
                }

                storyObj.put("title", "Story ${i + 1}")
                stories.add(storyObj)
            }

            Log.d(TAG, "API approach found ${stories.size} stories")
        } catch (e: Exception) {
            Log.e(TAG, "Instagram API approach failed: ${e.message}")
        }

        return stories
    }

    private fun fetchFacebookStories(username: String, cookiePath: String): List<JSONObject> {
        val stories = mutableListOf<JSONObject>()

        // SnapSave will not serve Facebook, so this is the working path and it
        // needs Facebook cookies. Build every plausible permalink from the input
        // instead of assuming a bare username.
        val clean = username.trim().trimEnd('/').substringBefore('?')
        val lastSegment = clean.substringAfterLast('/')
        val facebookUrls = buildList {
            if (clean.startsWith("stories/")) {
                add("https://www.facebook.com/$clean")
                // The opaque story id from the tray is not the story_fbid, so
                // also try the page feed, which yt-dlp can enumerate.
                val pageId = clean.removePrefix("stories/").substringBefore('/')
                if (pageId.isNotBlank()) add("https://www.facebook.com/$pageId/stories")
            } else if (clean.contains("/stories/")) {
                add("https://www.facebook.com/$clean")
            } else {
                add("https://www.facebook.com/stories/$clean")
                add("https://www.facebook.com/$clean/stories")
                add("https://www.facebook.com/$clean")
            }
        }.distinct()

        for (fbUrl in facebookUrls) {
            try {
                val request = YoutubeDLRequest(fbUrl)
                request.addOption("--cookies", cookiePath)
                request.addOption("--dump-single-json")
                request.addOption("--flat-playlist")
                request.addOption("--no-check-certificate")
                request.addOption("--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

                val response = YoutubeDL.getInstance().execute(request)
                val json = JSONObject(response.out)
                val entries = json.optJSONArray("entries")

                if (entries != null && entries.length() > 0) {
                    for (i in 0 until entries.length()) {
                        val entry = entries.getJSONObject(i)
                        val url = entry.optString("url", "")
                        if (url.contains("story") || url.contains("stories")) {
                            stories.add(parseYtDlpEntry(entry))
                        }
                    }
                }

                if (stories.isNotEmpty()) break
            } catch (e: Exception) {
                Log.w(TAG, "Facebook yt-dlp attempt failed for $fbUrl: ${e.message}")
            }
        }

        return stories
    }

    private fun parseYtDlpEntry(json: JSONObject): JSONObject {
        val obj = JSONObject()
        obj.put("id", json.optString("id", ""))
        obj.put("url", json.optString("webpage_url", json.optString("url", "")))
        obj.put("thumbnail", json.optString("thumbnail", ""))
        obj.put("title", json.optString("title", "Story"))
        obj.put("duration", json.optDouble("duration", 0.0))
        obj.put("timestamp", json.optDouble("timestamp", 0.0))
        
        // Determine type based on extension or extractor
        val ext = json.optString("ext", "mp4")
        val vcodec = json.optString("vcodec", "")
        obj.put("type", if (ext.contains("jpg") || ext.contains("png") || ext.contains("webp") ||
            (vcodec.isEmpty() || vcodec == "none")) "image" else "video")
        
        return obj
    }

    /**
     * Download a single story item
     */
    /**
     * Downloads one story.
     *
     * Items fetched through SnapSave arrive as a CDN url carrying a signed
     * token, so they are streamed straight to public storage: yt-dlp cannot
     * read that url and would only add a dependency it does not need. Any other
     * url (a plain Instagram permalink, say) still falls back to yt-dlp.
     */
    @ReactMethod
    fun downloadStory(
        storyUrl: String,
        platform: String,
        username: String,
        storyType: String,
        processId: String,
        promise: Promise
    ) {
        scope.launch {
            try {
                val published = saveStory(storyUrl, platform, username, storyType, processId)
                withContext(Dispatchers.Main) {
                    promise.resolve(
                        WritableNativeMap().apply {
                            putString("processId", processId)
                            putString("filePath", published)
                            putString("fileName", published.substringAfterLast('/'))
                            putString("platform", platform)
                            putInt("exitCode", 0)
                        }
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Story download failed", e)
                withContext(Dispatchers.Main) {
                    promise.reject("DOWNLOAD_ERROR", "Story download failed: ${e.message}")
                }
            }
        }
    }

    /**
     * Saves one story to public storage and returns the resulting path.
     *
     * Items fetched through SnapSave arrive as a CDN url carrying a signed
     * token, so they are streamed straight to storage: yt-dlp cannot read that
     * url and would only add a dependency it does not need. Anything else (a
     * plain Instagram permalink, say) still falls back to yt-dlp.
     */
    private suspend fun saveStory(
        storyUrl: String,
        platform: String,
        username: String,
        storyType: String,
        processId: String,
    ): String {
        val cacheDir = File(reactApplicationContext.cacheDir, "story_download_$processId")
        return try {
            if (isDirectMediaUrl(storyUrl)) {
                val isImage = storyType.equals("image", ignoreCase = true)
                val fileName = buildStoryFileName(username, processId, isImage)

                cacheDir.mkdirs()
                val temp = File(cacheDir, fileName)
                sendProgress(processId, 0.0, "Downloading story...")
                if (!SnapSaveClient.download(directMedia(storyUrl), temp)) {
                    throw IllegalStateException("SnapSave could not deliver the file")
                }

                MediaStorePublisher.publish(
                    context = reactApplicationContext,
                    source = temp,
                    platform = platform.lowercase(),
                    subfolder = "Stories",
                    mimeType = if (isImage) "image/jpeg" else "video/mp4",
                    displayName = fileName,
                ) ?: throw IllegalStateException("Could not save the file to public storage")
            } else {
                Log.d(TAG, "Not a direct url, falling back to yt-dlp: $storyUrl")
                downloadViaYtDlp(storyUrl, platform, storyType, processId, cacheDir)
            }.also {
                cacheDir.deleteRecursively()
            }
        } catch (e: Exception) {
            cacheDir.deleteRecursively()
            throw e
        }
    }

    /** SnapSave CDN urls are the only ones we can stream without yt-dlp. */
    private fun isDirectMediaUrl(url: String) = url.contains("d.rapidcdn.app/")

    private fun directMedia(url: String) = StoryMedia(
        id = url,
        downloadUrl = url,
        thumbnailUrl = "",
        realUrl = url,
        filename = url.substringBefore('?').substringAfterLast('/'),
        userAgent = SnapSaveClient.DEFAULT_USER_AGENT,
        isImage = false,
    )

    private fun buildStoryFileName(safeUser: String, processId: String, isImage: Boolean): String {
        val stamp = System.currentTimeMillis()
        val unique = processId.replace(Regex("""[^A-Za-z0-9]"""), "").take(6).ifBlank { "st" }
        return "$safeUser-${unique}${stamp % 100_000}.${if (isImage) "jpg" else "mp4"}"
    }

    private fun sendProgress(processId: String, progress: Double, line: String) {
        val params = WritableNativeMap().apply {
            putString("processId", processId)
            putDouble("progress", progress)
            putString("line", line)
        }
        sendEvent("onStoryDownloadProgress", params)
    }

    private suspend fun downloadViaYtDlp(
        storyUrl: String,
        platform: String,
        storyType: String,
        processId: String,
        cacheDir: File,
    ): String {
        val cookiePath = cookieModule.getCookieFilePath(platform.lowercase())
        val hasCookies = File(cookiePath).exists() && File(cookiePath).length() > 100
        val outputTemplate = "${cacheDir.absolutePath}/%(title).50s_%(id)s.%(ext)s"

        val request = YoutubeDLRequest(storyUrl)
        request.addOption("-o", outputTemplate)
        request.addOption("--no-playlist")
        request.addOption("--no-check-certificate")
        request.addOption("--force-ipv4")
        request.addOption("--socket-timeout", "30")

        if (hasCookies) {
            request.addOption("--cookies", cookiePath)
        }
        if (storyType.equals("image", ignoreCase = true)) {
            request.addOption("-f", "best")
        } else {
            request.addOption("-f", "best[ext=mp4]/best")
            request.addOption("--merge-output-format", "mp4")
        }
        request.addOption("--user-agent", MOBILE_UA)

        YoutubeDL.getInstance().execute(request, processId) { progress, _, line ->
            sendProgress(processId, progress.toDouble(), line ?: "Downloading...")
        }

        val downloadedFile = cacheDir.listFiles()
            ?.filter { it.isFile && !it.name.endsWith(".part") }
            ?.maxByOrNull { it.lastModified() }
            ?: throw IllegalStateException("Downloaded file not found")

        return MediaStorePublisher.publish(
            context = reactApplicationContext,
            source = downloadedFile,
            platform = platform.lowercase(),
            subfolder = "Stories",
            mimeType = if (storyType.equals("image", ignoreCase = true)) "image/jpeg" else "video/mp4",
        ) ?: throw IllegalStateException("Could not save the file to public storage")
    }

    /**
     * Download all stories from a list of story URLs
     */
    @ReactMethod
    fun downloadAllStories(
        storiesJson: String,
        platform: String,
        username: String,
        promise: Promise
    ) {
        scope.launch {
            try {
                val storiesArray = JSONArray(storiesJson)
                var successCount = 0
                var failCount = 0

                for (i in 0 until storiesArray.length()) {
                    val story = storiesArray.getJSONObject(i)
                    val url = story.optString("url", "")
                    val type = story.optString("type", "video")
                    val processId = "story_${System.currentTimeMillis()}_$i"

                    sendEvent(
                        "onBatchStoryProgress",
                        WritableNativeMap().apply {
                            putString("processId", "batch_stories")
                            putInt("current", i + 1)
                            putInt("total", storiesArray.length())
                            putString("status", "Downloading story ${i + 1}/${storiesArray.length()}...")
                        }
                    )

                    try {
                        saveStory(url, platform, username, type, processId)
                        successCount++
                    } catch (e: Exception) {
                        failCount++
                        Log.w(TAG, "Failed to download story ${i + 1}: ${e.message}")
                    }

                    delay(500) // Brief pause between downloads
                }

                withContext(Dispatchers.Main) {
                    val result = WritableNativeMap().apply {
                        putInt("success", successCount)
                        putInt("failed", failCount)
                        putInt("total", storiesArray.length())
                    }
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("BATCH_ERROR", "Batch download failed: ${e.message}")
                }
            }
        }
    }

    // Helper: Build Cookie header string from Netscape cookie file
    private fun buildCookieHeaderFromFile(cookiePath: String, domain: String): String {
        return try {
            File(cookiePath).readLines()
                .filter { !it.startsWith("#") && it.isNotBlank() }
                .mapNotNull { line ->
                    val parts = line.split("\t")
                    if (parts.size >= 7) {
                        val cookieDomain = parts[0]
                        if (cookieDomain.contains(domain.replace(".", "")) || domain.contains(cookieDomain.replace(".", "").take(5))) {
                            "${parts[5]}=${parts[6]}"
                        } else null
                    } else null
                }
                .joinToString("; ")
        } catch (e: Exception) {
            ""
        }
    }

    private fun extractCsrfToken(cookieString: String): String {
        return try {
            cookieString.split(";")
                .firstOrNull { it.trim().startsWith("csrftoken=") }
                ?.substringAfter("csrftoken=")
                ?.trim() ?: ""
        } catch (e: Exception) { "" }
    }
}
