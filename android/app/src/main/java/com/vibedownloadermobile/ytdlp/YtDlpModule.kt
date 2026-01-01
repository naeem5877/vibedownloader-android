package com.vibedownloadermobile.ytdlp

import android.os.Environment
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLException
import com.yausername.youtubedl_android.YoutubeDLRequest
import com.google.gson.Gson
import kotlinx.coroutines.*
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * YtDlpModule - Native module exposing yt-dlp functionality to React Native
 * 
 * Exposes:
 * - fetchInfo(url): Get video metadata as JSON
 * - download(url, outputPath): Download media with progress events
 * - cancelDownload(processId): Cancel an active download
 */
class YtDlpModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val activeDownloads = ConcurrentHashMap<String, AtomicBoolean>()
    private val gson = Gson()
    private var isInitialized = false
    
    companion object {
        const val NAME = "YtDlpModule"
        
        // Supported platforms - strict validation
        private val SUPPORTED_DOMAINS = listOf(
            // YouTube
            "youtube.com", "youtu.be", "youtube-nocookie.com", "m.youtube.com",
            // Instagram
            "instagram.com", "www.instagram.com",
            // Facebook
            "facebook.com", "fb.watch", "fb.com", "www.facebook.com", "m.facebook.com",
            // TikTok
            "tiktok.com", "www.tiktok.com", "vm.tiktok.com",
            // Spotify
            "spotify.com", "open.spotify.com",
            // X (Twitter)
            "twitter.com", "x.com", "mobile.twitter.com",
            // Pinterest
            "pinterest.com", "pin.it", "www.pinterest.com",
            // SoundCloud
            "soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"
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
        } catch (e: YoutubeDLException) {
            e.printStackTrace()
        }
    }

    /**
     * Validate URL against supported platforms
     */
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
    
    /**
     * Get platform name from URL for display purposes
     */
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

    /**
     * Fetch video/audio metadata from URL
     * Returns raw JSON from yt-dlp --dump-json
     */
    @ReactMethod
    fun fetchInfo(url: String, promise: Promise) {
        if (!isInitialized) {
            initializeYtDlp()
        }
        
        // Validate platform first
        if (!isValidPlatform(url)) {
            promise.reject(
                "PLATFORM_NOT_SUPPORTED",
                "This platform is not supported. Supported: YouTube, Instagram, Facebook, TikTok, Spotify, X, Pinterest, SoundCloud"
            )
            return
        }
        
        scope.launch {
            try {
                val request = YoutubeDLRequest(url)
                // Get best format selection
                request.addOption("-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best")
                request.addOption("--no-playlist")
                
                val videoInfo = YoutubeDL.getInstance().getInfo(request)
                
                // Build response map
                val result = WritableNativeMap().apply {
                    putString("id", videoInfo.id ?: "")
                    putString("title", videoInfo.title ?: "Untitled")
                    putString("description", videoInfo.description ?: "")
                    putString("thumbnail", videoInfo.thumbnail ?: "")
                    putString("uploader", videoInfo.uploader ?: "Unknown")
                    putString("uploaderUrl", "") // Not directly available
                    putDouble("duration", videoInfo.duration?.toDouble() ?: 0.0)
                    putDouble("viewCount", videoInfo.viewCount?.toDouble() ?: 0.0)
                    putDouble("likeCount", videoInfo.likeCount?.toDouble() ?: 0.0)
                    putString("uploadDate", videoInfo.uploadDate ?: "")
                    putString("extractor", videoInfo.extractor ?: "")
                    putString("url", url)
                    putString("platform", getPlatformName(url))
                    putString("ext", videoInfo.ext ?: "mp4")
                    putDouble("filesize", 0.0) // Calculated from formats if needed
                    putString("resolution", "") // Derived from width/height
                    putInt("width", videoInfo.width ?: 0)
                    putInt("height", videoInfo.height ?: 0)
                    putDouble("fps", 0.0) // Not directly available on VideoInfo
                    
                    // Formats array
                    val formatsArray = WritableNativeArray()
                    videoInfo.formats?.forEach { format ->
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
                            putBoolean("hasVideo", format.vcodec != null && format.vcodec != "none")
                            putBoolean("hasAudio", format.acodec != null && format.acodec != "none")
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

    /**
     * Download video/audio to the specified output path
     * Emits progress events: { processId, progress, eta, speed, filename }
     */
    @ReactMethod
    fun download(url: String, formatId: String?, processId: String, promise: Promise) {
        if (!isInitialized) {
            initializeYtDlp()
        }
        
        // Validate platform
        if (!isValidPlatform(url)) {
            promise.reject(
                "PLATFORM_NOT_SUPPORTED",
                "This platform is not supported. Supported: YouTube, Instagram, Facebook, TikTok, Spotify, X, Pinterest, SoundCloud"
            )
            return
        }
        
        // Create cancellation flag
        val isCancelled = AtomicBoolean(false)
        activeDownloads[processId] = isCancelled
        
        scope.launch {
            try {
                // Use scoped storage - Movies directory
                val outputDir = reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_MOVIES)
                    ?: throw Exception("Cannot access storage directory")
                
                if (!outputDir.exists()) {
                    outputDir.mkdirs()
                }
                
                val request = YoutubeDLRequest(url)
                request.addOption("-o", "${outputDir.absolutePath}/%(title)s.%(ext)s")
                request.addOption("--no-playlist")
                request.addOption("--no-mtime")
                
                // Apply format selection if provided
                if (!formatId.isNullOrEmpty()) {
                    request.addOption("-f", formatId)
                } else {
                    // Best quality by default
                    request.addOption("-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best")
                }
                
                // Embed metadata
                request.addOption("--embed-metadata")
                request.addOption("--embed-thumbnail")
                
                // Execute download with progress callback
                val response = YoutubeDL.getInstance().execute(
                    request,
                    processId
                ) { progress, eta, line ->
                    if (isCancelled.get()) {
                        return@execute
                    }
                    
                    // Emit progress event to React Native
                    val params = WritableNativeMap().apply {
                        putString("processId", processId)
                        putDouble("progress", progress.toDouble())
                        putDouble("eta", eta.toDouble())
                        putString("line", line ?: "")
                    }
                    
                    sendEvent("onDownloadProgress", params)
                }
                
                // Clean up
                activeDownloads.remove(processId)
                
                if (isCancelled.get()) {
                    withContext(Dispatchers.Main) {
                        promise.reject("CANCELLED", "Download was cancelled")
                    }
                    return@launch
                }
                
                // Success - find the downloaded file
                val result = WritableNativeMap().apply {
                    putString("processId", processId)
                    putString("outputDir", outputDir.absolutePath)
                    putInt("exitCode", response.exitCode)
                    putString("output", response.out)
                }
                
                withContext(Dispatchers.Main) {
                    promise.resolve(result)
                }
                
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

    /**
     * Cancel an active download by process ID
     */
    @ReactMethod
    fun cancelDownload(processId: String, promise: Promise) {
        try {
            val isCancelled = activeDownloads[processId]
            if (isCancelled != null) {
                isCancelled.set(true)
                YoutubeDL.getInstance().destroyProcessById(processId)
                activeDownloads.remove(processId)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e.message ?: "Failed to cancel download", e)
        }
    }

    /**
     * Update yt-dlp binary to latest version
     */
    @ReactMethod
    fun updateYtDlp(promise: Promise) {
        scope.launch {
            try {
                val status = YoutubeDL.getInstance().updateYoutubeDL(
                    reactApplicationContext,
                    YoutubeDL.UpdateChannel.STABLE
                )
                
                withContext(Dispatchers.Main) {
                    val result = WritableNativeMap().apply {
                        putString("status", status?.name ?: "UNKNOWN")
                    }
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("UPDATE_ERROR", e.message ?: "Failed to update yt-dlp", e)
                }
            }
        }
    }

    /**
     * Get list of supported platforms
     */
    @ReactMethod
    fun getSupportedPlatforms(promise: Promise) {
        val platforms = WritableNativeArray().apply {
            pushString("YouTube")
            pushString("Instagram")
            pushString("Facebook")
            pushString("TikTok")
            pushString("Spotify")
            pushString("X")
            pushString("Pinterest")
            pushString("SoundCloud")
        }
        promise.resolve(platforms)
    }

    /**
     * Validate if a URL is from a supported platform
     */
    @ReactMethod
    fun validateUrl(url: String, promise: Promise) {
        val isValid = isValidPlatform(url)
        val result = WritableNativeMap().apply {
            putBoolean("valid", isValid)
            putString("platform", if (isValid) getPlatformName(url) else null)
        }
        promise.resolve(result)
    }

    /**
     * Get the output directory path
     */
    @ReactMethod
    fun getOutputDirectory(promise: Promise) {
        try {
            val outputDir = reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_MOVIES)
            promise.resolve(outputDir?.absolutePath ?: "")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message ?: "Failed to get output directory")
        }
    }

    /**
     * List downloaded files
     */
    @ReactMethod
    fun listDownloadedFiles(promise: Promise) {
        try {
            val outputDir = reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_MOVIES)
            val files = WritableNativeArray()
            
            outputDir?.listFiles()?.forEach { file ->
                if (file.isFile) {
                    val fileMap = WritableNativeMap().apply {
                        putString("name", file.name)
                        putString("path", file.absolutePath)
                        putDouble("size", file.length().toDouble())
                        putDouble("modified", file.lastModified().toDouble())
                    }
                    files.pushMap(fileMap)
                }
            }
            
            promise.resolve(files)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message ?: "Failed to list files")
        }
    }

    /**
     * Delete a downloaded file
     */
    @ReactMethod
    fun deleteFile(filePath: String, promise: Promise) {
        try {
            val file = File(filePath)
            if (file.exists() && file.delete()) {
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message ?: "Failed to delete file")
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        scope.cancel()
        activeDownloads.clear()
    }
}
