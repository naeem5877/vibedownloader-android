package com.vibedownloadermobile.story

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.vibedownloadermobile.cookie.CookieModule
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * StoryModule - Fetches and downloads Instagram & Facebook stories by username
 * Strategy:
 * 1. Use yt-dlp with cookies to fetch story list from profile URL
 * 2. If yt-dlp fails (common for stories), fall back to direct HTTP scraping
 * 3. Download each story (image/video) using yt-dlp with cookies
 */
class StoryModule(
    reactContext: ReactApplicationContext,
    private val cookieModule: CookieModule
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "StoryModule"
        const val TAG = "StoryModule"
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = NAME

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Fetch stories for a platform username
     * Returns a list of story items (type, url, thumbnail, timestamp)
     */
    @ReactMethod
    fun fetchStories(platform: String, username: String, promise: Promise) {
        scope.launch {
            try {
                Log.d(TAG, "Fetching stories for $platform: $username")
                
                val cookiePath = cookieModule.getCookieFilePath(platform.lowercase())
                val hasCookies = File(cookiePath).exists() && File(cookiePath).length() > 100
                
                if (!hasCookies) {
                    withContext(Dispatchers.Main) {
                        promise.reject("NO_COOKIES", "Please log in to $platform first to fetch stories")
                    }
                    return@launch
                }

                val stories = when (platform.lowercase()) {
                    "instagram" -> fetchInstagramStories(username, cookiePath)
                    "facebook" -> fetchFacebookStories(username, cookiePath)
                    else -> throw Exception("Story fetching not supported for $platform")
                }

                val result = WritableNativeArray()
                for (story in stories) {
                    val storyMap = WritableNativeMap().apply {
                        putString("id", story.optString("id", ""))
                        putString("url", story.optString("url", ""))
                        putString("thumbnail", story.optString("thumbnail", ""))
                        putString("type", story.optString("type", "video")) // image or video
                        putDouble("timestamp", story.optDouble("timestamp", 0.0))
                        putString("username", username)
                        putString("platform", platform)
                        putDouble("duration", story.optDouble("duration", 0.0))
                        putString("title", story.optString("title", "Story"))
                    }
                    result.pushMap(storyMap)
                }

                withContext(Dispatchers.Main) {
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to fetch stories", e)
                withContext(Dispatchers.Main) {
                    promise.reject("FETCH_ERROR", "Failed to fetch stories: ${e.message}")
                }
            }
        }
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
        
        // Try yt-dlp with cookies first
        val facebookUrls = listOf(
            "https://www.facebook.com/$username",
            "https://www.facebook.com/stories/$username"
        )
        
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
                val cookiePath = cookieModule.getCookieFilePath(platform.lowercase())
                val hasCookies = File(cookiePath).exists() && File(cookiePath).length() > 100

                val cacheDir = File(reactApplicationContext.cacheDir, "story_download_$processId")
                if (!cacheDir.exists()) cacheDir.mkdirs()

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

                if (storyType == "image") {
                    // For image stories, just download the file directly
                    request.addOption("-f", "best")
                } else {
                    request.addOption("-f", "best[ext=mp4]/best")
                    request.addOption("--merge-output-format", "mp4")
                }

                request.addOption("--user-agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")

                YoutubeDL.getInstance().execute(request, processId) { progress, _, line ->
                    val params = WritableNativeMap().apply {
                        putString("processId", processId)
                        putDouble("progress", progress.toDouble())
                        putString("line", line ?: "Downloading...")
                    }
                    sendEvent("onStoryDownloadProgress", params)
                }

                val downloadedFile = cacheDir.listFiles()
                    ?.filter { it.isFile && !it.name.endsWith(".part") }
                    ?.maxByOrNull { it.lastModified() }
                    ?: throw Exception("Downloaded file not found")

                // Move to public storage
                val baseDir = reactApplicationContext.getExternalFilesDir(null)
                val storyDir = File(baseDir, "vibedownloader/$platform/Stories/$username")
                if (!storyDir.exists()) storyDir.mkdirs()

                val destFile = File(storyDir, downloadedFile.name)
                downloadedFile.copyTo(destFile, overwrite = true)
                downloadedFile.delete()
                cacheDir.deleteRecursively()

                // Scan to gallery
                android.media.MediaScannerConnection.scanFile(
                    reactApplicationContext,
                    arrayOf(destFile.absolutePath),
                    null,
                    null
                )

                withContext(Dispatchers.Main) {
                    val result = WritableNativeMap().apply {
                        putString("processId", processId)
                        putString("filePath", destFile.absolutePath)
                        putString("fileName", destFile.name)
                        putString("platform", platform)
                        putInt("exitCode", 0)
                    }
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                val cacheDir = File(reactApplicationContext.cacheDir, "story_download_$processId")
                if (cacheDir.exists()) cacheDir.deleteRecursively()

                withContext(Dispatchers.Main) {
                    promise.reject("DOWNLOAD_ERROR", "Story download failed: ${e.message}")
                }
            }
        }
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

                    // Send progress event
                    val progressParams = WritableNativeMap().apply {
                        putString("processId", "batch_stories")
                        putInt("current", i + 1)
                        putInt("total", storiesArray.length())
                        putString("status", "Downloading story ${i + 1}/${storiesArray.length()}...")
                    }
                    sendEvent("onBatchStoryProgress", progressParams)

                    try {
                        val cookiePath = cookieModule.getCookieFilePath(platform.lowercase())

                        val cacheDir = File(reactApplicationContext.cacheDir, "story_dl_$processId")
                        if (!cacheDir.exists()) cacheDir.mkdirs()

                        val request = YoutubeDLRequest(url)
                        request.addOption("-o", "${cacheDir.absolutePath}/%(title).50s.%(ext)s")
                        request.addOption("--no-check-certificate")
                        request.addOption("--force-ipv4")
                        request.addOption("--no-playlist")

                        if (File(cookiePath).exists()) {
                            request.addOption("--cookies", cookiePath)
                        }

                        if (type == "image") {
                            request.addOption("-f", "best")
                        } else {
                            request.addOption("-f", "best[ext=mp4]/best")
                            request.addOption("--merge-output-format", "mp4")
                        }

                        request.addOption("--user-agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15")

                        YoutubeDL.getInstance().execute(request, processId)

                        val downloaded = cacheDir.listFiles()?.firstOrNull { it.isFile }
                        if (downloaded != null) {
                            val baseDir = reactApplicationContext.getExternalFilesDir(null)
                            val storyDir = File(baseDir, "vibedownloader/$platform/Stories/$username")
                            if (!storyDir.exists()) storyDir.mkdirs()
                            val dest = File(storyDir, downloaded.name)
                            downloaded.copyTo(dest, overwrite = true)
                            android.media.MediaScannerConnection.scanFile(
                                reactApplicationContext, arrayOf(dest.absolutePath), null, null
                            )
                            successCount++
                        }
                        cacheDir.deleteRecursively()
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
