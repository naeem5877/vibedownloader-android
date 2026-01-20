package com.vibedownloadermobile.ytdlp

import android.content.Intent
import android.content.Context
import android.content.ClipboardManager
import android.app.Activity
import android.os.Environment
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLException
import com.yausername.youtubedl_android.YoutubeDLRequest
import com.google.gson.Gson
import kotlinx.coroutines.*
import java.io.File
import java.io.BufferedInputStream
import java.io.FileOutputStream
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

class YtDlpModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val activeDownloads = ConcurrentHashMap<String, AtomicBoolean>()
    private var isInitialized = false
    
    companion object {
        const val NAME = "YtDlpModule"
        const val TAG = "YtDlpModule"
        
        // Supported platforms
        private val SUPPORTED_DOMAINS = listOf(
            "youtube.com", "youtu.be", "youtube-nocookie.com", "m.youtube.com",
            "instagram.com", "www.instagram.com",
            "facebook.com", "fb.watch", "fb.com", "www.facebook.com", "m.facebook.com",
            "tiktok.com", "www.tiktok.com", "vm.tiktok.com",
            "spotify.com", "open.spotify.com",
            "twitter.com", "x.com", "mobile.twitter.com",
            "pinterest.com", "pin.it", "www.pinterest.com",
            "soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"
        )

        private val SHORT_PATTERNS = listOf(
            "/shorts/", "/reel/", "/reels/", "/short/", "vm.tiktok.com"
        )
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        initializeYtDlp()
    }
    
    private fun initializeYtDlp() {
        if (isInitialized) return
        try {
            YoutubeDL.getInstance().init(reactApplicationContext)
            com.yausername.ffmpeg.FFmpeg.getInstance().init(reactApplicationContext)
            isInitialized = true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize YtDlp", e)
        }
    }

    private fun isValidPlatform(url: String): Boolean {
        return try {
            val host = java.net.URI(url).host?.lowercase() ?: return false
            SUPPORTED_DOMAINS.any { domain -> 
                host == domain || host.endsWith(".$domain") 
            }
        } catch (e: Exception) {
            false
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
                else -> "Unknown"
            }
        } catch (e: Exception) {
            "Unknown"
        }
    }

    private fun getContentType(url: String, platform: String): String {
        val urlLower = url.lowercase()
        if (SHORT_PATTERNS.any { urlLower.contains(it) }) return "Shorts"
        
        return when (platform) {
            "YouTube" -> if (urlLower.contains("/shorts/")) "Shorts" else "Videos"
            "Instagram" -> if (urlLower.contains("/reel")) "Reels" else "Posts"
            "Facebook" -> if (urlLower.contains("/reel")) "Reels" else "Videos"
            "Spotify", "SoundCloud" -> "Music"
            "Pinterest" -> "Pins"
            else -> "Downloads"
        }
    }

    private fun getOrganizedOutputDir(url: String): File {
        val platform = getPlatformName(url)
        val contentType = getContentType(url, platform)
        val baseDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
        val vibeDir = File(baseDir, "VibeDownloader")
        val platformDir = File(vibeDir, platform)
        val typeDir = File(platformDir, contentType)
        if (!typeDir.exists()) typeDir.mkdirs()
        return typeDir
    }

    private fun getAppOutputDir(): File {
        val outputDir = reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_MOVIES)
            ?: throw Exception("Cannot access storage directory")
        if (!outputDir.exists()) outputDir.mkdirs()
        return outputDir
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

    @ReactMethod
    fun fetchInfo(url: String, promise: Promise) {
        if (!isInitialized) initializeYtDlp()
        
        if (!isValidPlatform(url)) {
            promise.reject("PLATFORM_NOT_SUPPORTED", "This platform is not supported.")
            return
        }
        
        scope.launch {
            try {
                val platform = getPlatformName(url)
                val request = YoutubeDLRequest(url)
                
                if (platform == "YouTube") {
                    request.addOption("-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best")
                }
                request.addOption("--no-playlist")
                
                val videoInfo = YoutubeDL.getInstance().getInfo(request)
                
                val result = WritableNativeMap().apply {
                    putString("id", videoInfo.id ?: "")
                    putString("title", videoInfo.title ?: "Untitled")
                    putString("description", videoInfo.description ?: "")
                    putString("thumbnail", videoInfo.thumbnail ?: "")
                    putString("uploader", videoInfo.uploader ?: "Unknown")
                    putString("uploaderUrl", "")
                    putDouble("duration", videoInfo.duration?.toDouble() ?: 0.0)
                    putDouble("viewCount", videoInfo.viewCount?.toDouble() ?: 0.0)
                    putDouble("likeCount", videoInfo.likeCount?.toDouble() ?: 0.0)
                    putString("uploadDate", videoInfo.uploadDate ?: "")
                    putString("extractor", videoInfo.extractor ?: "")
                    putString("url", url)
                    putString("platform", platform)
                    putString("ext", videoInfo.ext ?: "mp4")
                    putDouble("filesize", 0.0)
                    putString("resolution", "")
                    putInt("width", videoInfo.width ?: 0)
                    putInt("height", videoInfo.height ?: 0)
                    putDouble("fps", 0.0)
                    
                    val formatsArray = WritableNativeArray()
                    videoInfo.formats?.forEach { format ->
                        // Filter Logic
                        val isVideoFormat = format.vcodec != null && format.vcodec != "none"
                        val isAudioFormat = format.acodec != null && format.acodec != "none"
                        val ext = format.ext?.lowercase() ?: ""
                        
                        if (platform == "YouTube") {
                            if (ext != "mp4" && ext != "m4a" && ext != "webm") return@forEach
                        }
                        
                        val formatMap = WritableNativeMap().apply {
                            putString("formatId", format.formatId ?: "")
                            putString("formatNote", format.formatNote ?: "")
                            putString("ext", format.ext ?: "")
                            putDouble("filesize", format.fileSize?.toDouble() ?: 0.0)
                            putDouble("tbr", format.tbr?.toDouble() ?: 0.0)
                            putInt("width", format.width ?: 0)
                            putInt("height", format.height ?: 0)
                            putString("resolution", "${format.width ?: 0}x${format.height ?: 0}")
                            putDouble("fps", format.fps?.toDouble() ?: 0.0)
                            putString("vcodec", format.vcodec ?: "")
                            putString("acodec", format.acodec ?: "")
                            putBoolean("hasVideo", isVideoFormat)
                            putBoolean("hasAudio", isAudioFormat)
                        }
                        formatsArray.pushMap(formatMap)
                    }
                    putArray("formats", formatsArray)
                }
                
                withContext(Dispatchers.Main) {
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("FETCH_ERROR", e.message ?: "Failed to fetch video info", e)
                }
            }
        }
    }

    @ReactMethod
    fun download(url: String, formatId: String?, processId: String, promise: Promise) {
        if (!isInitialized) initializeYtDlp()
        
        if (!isValidPlatform(url)) {
            promise.reject("PLATFORM_NOT_SUPPORTED", "This platform is not supported.")
            return
        }
        
        val isCancelled = AtomicBoolean(false)
        activeDownloads[processId] = isCancelled
        
        scope.launch {
            try {
                val platform = getPlatformName(url)
                val outputDir = try {
                    getOrganizedOutputDir(url)
                } catch (e: Exception) {
                    getAppOutputDir()
                }
                
                val request = YoutubeDLRequest(url)
                request.addOption("-o", "${outputDir.absolutePath}/%(title).100s.%(ext)s")
                request.addOption("--no-playlist")
                request.addOption("--restrict-filenames")
                
                // --- Enhanced Format Selection with FFmpeg Merge (Desktop Parity) ---
                if (!formatId.isNullOrEmpty()) {
                    when {
                        formatId == "audio_best" || formatId == "audio_mp3" -> {
                            // Extract Audio - MP3 Best Quality (320kbps)
                            request.addOption("-x")
                            request.addOption("--audio-format", "mp3")
                            request.addOption("--audio-quality", "0")
                            request.addOption("--embed-thumbnail")
                            request.addOption("--embed-metadata")
                        }
                        formatId == "audio_standard" -> {
                            // Extract Audio - MP3 Standard Quality (192kbps)
                            request.addOption("-x")
                            request.addOption("--audio-format", "mp3")
                            request.addOption("--audio-quality", "5")
                            request.addOption("--embed-thumbnail")
                            request.addOption("--embed-metadata")
                        }
                        formatId == "audio_low" -> {
                            // Extract Audio - MP3 Low Quality (128kbps)
                            request.addOption("-x")
                            request.addOption("--audio-format", "mp3")
                            request.addOption("--audio-quality", "9")
                            request.addOption("--embed-thumbnail")
                            request.addOption("--embed-metadata")
                        }
                        formatId == "best" -> {
                            // Best video+audio combo - Platform optimized
                            when (platform) {
                                "YouTube" -> {
                                    // Prioritize MP4 H.264 + M4A AAC merged via FFmpeg
                                    request.addOption("-f", "bestvideo[ext=mp4][vcodec^=avc1][height<=2160]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best")
                                    request.addOption("--merge-output-format", "mp4")
                                }
                                "Instagram", "TikTok", "Facebook" -> {
                                    request.addOption("-f", "best[ext=mp4]/best")
                                }
                                else -> {
                                    request.addOption("-f", "best[ext=mp4]/best")
                                }
                            }
                        }
                        else -> {
                            // Specific format requested (e.g., "137" for 1080p)
                            if (platform == "YouTube") {
                                // YouTube: Merge specified video format with best audio using FFmpeg
                                request.addOption("-f", "${formatId}+bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio/${formatId}")
                                request.addOption("--merge-output-format", "mp4")
                            } else {
                                // Other platforms: Try to merge, fallback to direct
                                request.addOption("-f", "${formatId}+bestaudio/best")
                                request.addOption("--merge-output-format", "mp4")
                            }
                        }
                    }
                } else {
                    // No format specified - Smart defaults based on platform
                    when (platform) {
                        "YouTube" -> {
                            // YouTube Best: 4K/1080p H.264 + Best AAC merged with FFmpeg
                            request.addOption("-f", "bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio/best[ext=mp4]/best")
                            request.addOption("--merge-output-format", "mp4")
                        }
                        "Instagram", "TikTok", "Facebook" -> {
                            // Social: Best combined MP4 format
                            request.addOption("-f", "best[ext=mp4]/best")
                        }
                        "Spotify", "SoundCloud" -> {
                            // Audio platforms: Best audio quality as MP3
                            request.addOption("-f", "bestaudio")
                            request.addOption("-x")
                            request.addOption("--audio-format", "mp3")
                            request.addOption("--audio-quality", "0")
                            request.addOption("--embed-thumbnail")
                            request.addOption("--embed-metadata")
                        }
                        else -> {
                            request.addOption("-f", "best[ext=mp4]/best")
                        }
                    }
                }
                
                // Common metadata options (similar to desktop)
                // Only embed metadata/thumbnail for audio files (MP3, etc.)
                if (formatId?.startsWith("audio") == true) {
                    request.addOption("--embed-metadata")
                    request.addOption("--embed-thumbnail")
                    request.addOption("--write-thumbnail")
                    request.addOption("--convert-thumbnails", "jpg")
                }
                
                // Speed optimization - parallel downloads
                request.addOption("--concurrent-fragments", "8")
                
                // NO manual FFmpeg location setting - let library handle it

                val response = YoutubeDL.getInstance().execute(request, processId) { progress, eta, line ->
                    if (isCancelled.get()) return@execute
                    val params = WritableNativeMap().apply {
                        putString("processId", processId)
                        putDouble("progress", progress.toDouble())
                        putDouble("eta", eta.toDouble())
                        putString("line", line ?: "")
                    }
                    sendEvent("onDownloadProgress", params)
                }
                
                activeDownloads.remove(processId)
                if (isCancelled.get()) {
                    withContext(Dispatchers.Main) { promise.reject("CANCELLED", "Download was cancelled") }
                    return@launch
                }
                
                // Find file
                val downloadedFile = outputDir.listFiles()
                    ?.filter { it.isFile && it.lastModified() > System.currentTimeMillis() - 300000 } // 5 mins
                    ?.maxByOrNull { it.lastModified() }
                
                val result = WritableNativeMap().apply {
                    putString("processId", processId)
                    putString("outputDir", outputDir.absolutePath)
                    putString("filePath", downloadedFile?.absolutePath ?: "")
                    putString("fileName", downloadedFile?.name ?: "")
                    putInt("exitCode", response.exitCode)
                    putString("output", response.out)
                    putString("platform", platform)
                }
                
                withContext(Dispatchers.Main) { promise.resolve(result) }
                
            } catch (e: Exception) {
                activeDownloads.remove(processId)
                withContext(Dispatchers.Main) {
                    if (isCancelled.get()) {
                        promise.reject("CANCELLED", "Download was cancelled")
                    } else {
                        promise.reject("DOWNLOAD_ERROR", e.message ?: "Download failed", e)
                    }
                }
            }
        }
    }

    @ReactMethod
    fun cancelDownload(processId: String, promise: Promise) {
        val isCancelled = activeDownloads[processId]
        if (isCancelled != null) {
            isCancelled.set(true)
            try {
                // Force kill logic if needed, usually destroyProcessById is proper
                YoutubeDL.getInstance().destroyProcessById(processId)
            } catch (e: Exception) {
                Log.e(TAG, "Error destroying process", e)
            }
            activeDownloads.remove(processId)
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

    @ReactMethod
    fun listDownloadedFiles(promise: Promise) {
        promise.resolve(WritableNativeArray())
    }
    
    @ReactMethod
    fun deleteFile(filePath: String, promise: Promise) {
        try {
            val file = File(filePath)
            if (file.exists()) {
                val deleted = file.delete()
                promise.resolve(deleted)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("DELETE_ERROR", e.message)
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
