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
    private var notificationId = 1000
    
    companion object {
        const val NAME = "YtDlpModule"
        const val TAG = "YtDlpModule"
        const val CHANNEL_ID = "vibe_download_complete"
        const val CHANNEL_NAME = "Download Complete"
        
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
        createNotificationChannel()
    }
    
    private fun initializeYtDlp() {
        if (isInitialized) return
        try {
            YoutubeDL.getInstance().init(reactApplicationContext)
            com.yausername.ffmpeg.FFmpeg.getInstance().init(reactApplicationContext)
            isInitialized = true
            Log.d(TAG, "YtDlp initialized successfully")
            
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
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = NotificationManager.IMPORTANCE_DEFAULT
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                description = "Notifications for completed downloads"
            }
            val notificationManager = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
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

    private fun moveToPublicStorage(sourceFile: File, platform: String, contentType: String): File? {
        val extension = sourceFile.extension.lowercase()
        val isVideo = listOf("mp4", "mkv", "webm").contains(extension)
        val isAudio = listOf("mp3", "m4a", "wav").contains(extension)
        val isImage = listOf("jpg", "png", "webp").contains(extension)
        
        val relativePath = "Movies/VibeDownloader/$platform/$contentType"
        val mimeType = when(extension) {
            "mp4" -> "video/mp4"
            "mkv" -> "video/x-matroska"
            "webm" -> "video/webm"
            "mp3" -> "audio/mpeg"
            "m4a" -> "audio/mp4"
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            else -> "*/*"
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = android.content.ContentValues().apply {
                put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, sourceFile.name)
                put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mimeType)
                put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
                put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)
            }

            val collection = when {
                isVideo -> android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                isAudio -> android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                isImage -> android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                else -> android.provider.MediaStore.Files.getContentUri("external")
            }

            val resolver = reactApplicationContext.contentResolver
            val uri = resolver.insert(collection, values) ?: return null

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
                
                // Return estimated File object for UI (path is virtual in Scoped Storage but useful for display)
                val publicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
                File(publicDir, "VibeDownloader/$platform/$contentType/${sourceFile.name}")
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to move file to MediaStore", e)
                resolver.delete(uri, null, null)
                null
            }
        } else {
            // Legacy implementation for Android 9 and below
            val publicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
            val targetDir = File(publicDir, "VibeDownloader/$platform/$contentType")
            if (!targetDir.exists()) targetDir.mkdirs()
            val targetFile = File(targetDir, sourceFile.name)
            
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
                
                // 1. Download to temp cache directory first
                val cacheDir = File(reactApplicationContext.cacheDir, "temp_download")
                if (!cacheDir.exists()) cacheDir.mkdirs()
                
                Log.d(TAG, "Starting download to cache: ${cacheDir.absolutePath}")

                val request = YoutubeDLRequest(url)
                request.addOption("-o", "${cacheDir.absolutePath}/%(title).100s.%(ext)s")
                request.addOption("--no-playlist")
                request.addOption("--restrict-filenames")
                
                // --- Codec Compatibility & Format Selection ---
                if (!formatId.isNullOrEmpty()) {
                     when {
                        formatId == "audio_best" || formatId == "audio_mp3" -> {
                            request.addOption("-x")
                            request.addOption("--audio-format", "mp3")
                            request.addOption("--audio-quality", "0")
                        }
                        formatId.startsWith("audio") -> {
                            request.addOption("-x")
                            request.addOption("--audio-format", "mp3")
                        }
                        else -> {
                            // Specific format - ensure MP4 container
                            request.addOption("-f", "${formatId}+bestaudio/best")
                            request.addOption("--merge-output-format", "mp4")
                        }
                    }
                } else {
                    // Smart defaults - Prefer H.264 (AVC) for compatibility with older players
                    when (platform) {
                        "YouTube" -> {
                            // Prefer 1080p H.264 if available, otherwise best MP4
                            request.addOption("-f", "bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio/best[ext=mp4]/best")
                            request.addOption("--merge-output-format", "mp4")
                        }
                        else -> {
                            // General: Prefer MP4 container
                            request.addOption("-f", "best[ext=mp4]/best")
                            request.addOption("--merge-output-format", "mp4")
                        }
                    }
                }
                
                // Metadata & Thumbnails
                request.addOption("--embed-metadata")
                request.addOption("--embed-thumbnail")
                request.addOption("--write-thumbnail")
                request.addOption("--convert-thumbnails", "jpg")
                request.addOption("--force-ipv4")
                request.addOption("--no-check-certificate")
                
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
                
                // Check cancellation
                activeDownloads.remove(processId)
                if (isCancelled.get()) {
                    // Clean up temp file
                    cacheDir.listFiles()?.forEach { it.delete() }
                    withContext(Dispatchers.Main) { promise.reject("CANCELLED", "Download was cancelled") }
                    return@launch
                }
                
                // Find downloaded file in cache
                val downloadedFile = cacheDir.listFiles()
                    ?.filter { it.isFile && it.lastModified() > System.currentTimeMillis() - 300000 && !it.name.endsWith(".jpg") && !it.name.endsWith(".webp") }
                    ?.maxByOrNull { it.lastModified() }
                    
                if (downloadedFile != null && downloadedFile.exists()) {
                    // Find matching thumbnail
                    val baseName = downloadedFile.nameWithoutExtension
                    val thumbFile = cacheDir.listFiles()?.find { 
                        it.nameWithoutExtension == baseName && (it.extension == "jpg" || it.extension == "webp" || it.extension == "png") 
                    }

                    // 2. Move to Public Storage (Gallery/Album)
                    val contentType = getContentType(url, platform)
                    val finalFile = moveToPublicStorage(downloadedFile, platform, contentType)
                    
                    // Handle thumbnail - Move to Private Storage to keep Gallery clean
                    if (thumbFile != null && thumbFile.exists()) {
                        try {
                            val thumbDir = File(reactApplicationContext.getExternalFilesDir(null), "thumbnails")
                            if (!thumbDir.exists()) thumbDir.mkdirs()
                            // Use same name as final file if possible, or original base name
                            val finalName = finalFile?.nameWithoutExtension ?: baseName
                            val targetThumb = File(thumbDir, "$finalName.jpg")
                            thumbFile.copyTo(targetThumb, overwrite = true)
                            thumbFile.delete()
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
                        }
                        
                        // Notify
                        showDownloadNotification(finalFile.name, finalFile.absolutePath, platform)
                        
                        withContext(Dispatchers.Main) { promise.resolve(result) }
                    } else {
                        throw Exception("Failed to move file to public storage")
                    }
                } else {
                    throw Exception("Download file not found")
                }
                
            } catch (e: Exception) {
                // Cleanup temp dir
                try {
                    val cacheDir = File(reactApplicationContext.cacheDir, "temp_download")
                    if (cacheDir.exists()) cacheDir.deleteRecursively()
                } catch (e2: Exception) {}
                
                activeDownloads.remove(processId)
                withContext(Dispatchers.Main) {
                    promise.reject("DOWNLOAD_ERROR", e.message ?: "Download failed", e)
                }
            }
        }
    }
    
    // ... [Inside listDownloadedFiles method] ...
    
    @ReactMethod
    fun listDownloadedFiles(promise: Promise) {
        scope.launch {
            try {
                val baseDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
                val vibeDir = File(baseDir, "VibeDownloader")
                val thumbDir = File(reactApplicationContext.getExternalFilesDir(null), "thumbnails")
                
                if (!vibeDir.exists()) {
                    withContext(Dispatchers.Main) {
                        promise.resolve(WritableNativeArray())
                    }
                    return@launch
                }
                
                val filesArray = WritableNativeArray()
                
                // Recursively find all files in the vibedownloader directory
                vibeDir.walkTopDown().forEach { file ->
                    if (file.isFile && !file.isHidden) {
                        // Extract platform and content type from path
                        // Path format: vibedownloader/[Platform]/[ContentType]/filename.ext
                        val relativePath = file.absolutePath.removePrefix(vibeDir.absolutePath + "/")
                        val pathParts = relativePath.split("/")
                        
                        val platform = if (pathParts.size >= 2) pathParts[0] else "Unknown"
                        val contentType = if (pathParts.size >= 3) pathParts[1] else "Downloads"
                        
                        // Check for thumbnail in private dir
                        val thumbPath = File(thumbDir, "${file.nameWithoutExtension}.jpg")
                        val thumbnail = if (thumbPath.exists()) "file://${thumbPath.absolutePath}" else null
                        
                        val fileMap = WritableNativeMap().apply {
                            putString("name", file.name)
                            putString("path", file.absolutePath)
                            putDouble("size", file.length().toDouble())
                            putDouble("modified", file.lastModified().toDouble())
                            putString("platform", platform)
                            putString("contentType", contentType)
                            putString("extension", file.extension)
                            putString("thumbnail", thumbnail)
                        }
                        filesArray.pushMap(fileMap)
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
        scope.launch {
            try {
                val baseDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
                val vibeDir = File(baseDir, "VibeDownloader")
                
                if (!vibeDir.exists()) {
                    withContext(Dispatchers.Main) {
                        promise.resolve(WritableNativeArray())
                    }
                    return@launch
                }
                
                val filesArray = WritableNativeArray()
                
                // Recursively find all files in the vibedownloader directory
                vibeDir.walkTopDown().forEach { file ->
                    if (file.isFile) {
                        // Extract platform and content type from path
                        // Path format: vibedownloader/[Platform]/[ContentType]/filename.ext
                        val relativePath = file.absolutePath.removePrefix(vibeDir.absolutePath + "/")
                        val pathParts = relativePath.split("/")
                        
                        val platform = if (pathParts.size >= 2) pathParts[0] else "Unknown"
                        val contentType = if (pathParts.size >= 3) pathParts[1] else "Downloads"
                        
                        val fileMap = WritableNativeMap().apply {
                            putString("name", file.name)
                            putString("path", file.absolutePath)
                            putDouble("size", file.length().toDouble())
                            putDouble("modified", file.lastModified().toDouble())
                            putString("platform", platform)
                            putString("contentType", contentType)
                            putString("extension", file.extension)
                        }
                        filesArray.pushMap(fileMap)
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
            
            val mimeType = when {
                filePath.endsWith(".mp4") -> "video/mp4"
                filePath.endsWith(".webm") -> "video/webm"
                filePath.endsWith(".mkv") -> "video/x-matroska"
                filePath.endsWith(".mp3") -> "audio/mpeg"
                filePath.endsWith(".m4a") -> "audio/m4a"
                filePath.endsWith(".jpg") || filePath.endsWith(".jpeg") -> "image/jpeg"
                filePath.endsWith(".png") -> "image/png"
                filePath.endsWith(".webp") -> "image/webp"
                else -> "*/*"
            }
            
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
            
            val mimeType = when {
                filePath.endsWith(".mp4") -> "video/mp4"
                filePath.endsWith(".webm") -> "video/webm"
                filePath.endsWith(".mkv") -> "video/x-matroska"
                filePath.endsWith(".mp3") -> "audio/mpeg"
                filePath.endsWith(".m4a") -> "audio/m4a"
                filePath.endsWith(".jpg") || filePath.endsWith(".jpeg") -> "image/jpeg"
                filePath.endsWith(".png") -> "image/png"
                filePath.endsWith(".webp") -> "image/webp"
                else -> "*/*"
            }
            
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
        try {
            val file = File(filePath)
            
            // 1. Try cleanups

            
            // Try to delete associated thumbnail first (cleanup)
            try {
                val thumbDir = File(reactApplicationContext.getExternalFilesDir(null), "thumbnails")
                val thumbFile = File(thumbDir, "${file.nameWithoutExtension}.jpg")
                if (thumbFile.exists()) {
                    thumbFile.delete()
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to delete thumbnail", e)
            }

            if (file.exists() && file.delete()) {
                 // Notify scanner about deletion
                 android.media.MediaScannerConnection.scanFile(
                     reactApplicationContext, 
                     arrayOf(filePath), 
                     null, 
                     null
                 )
                 promise.resolve(true)
                 return
            }
            
            // 2. Try MediaStore deletion (Android 10+) if file still exists or simple delete failed
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val resolver = reactApplicationContext.contentResolver
                val projection = arrayOf(android.provider.MediaStore.MediaColumns._ID)
                val selection = "${android.provider.MediaStore.MediaColumns.DATA} = ?"
                val selectionArgs = arrayOf(filePath)
                
                // Helper to check and delete from a specific collection
                fun deleteFromCollection(collectionUri: Uri): Boolean {
                    var deleted = false
                    try {
                        resolver.query(collectionUri, projection, selection, selectionArgs, null)?.use { cursor ->
                            if (cursor.moveToFirst()) {
                                try {
                                    val idColumn = cursor.getColumnIndexOrThrow(android.provider.MediaStore.MediaColumns._ID)
                                    val id = cursor.getLong(idColumn)
                                    val contentUri = android.content.ContentUris.withAppendedId(collectionUri, id)
                                    resolver.delete(contentUri, null, null)
                                    deleted = true
                                } catch (e: Exception) {
                                    Log.w(TAG, "Failed to delete item from MediaStore: $e")
                                }
                            }
                        }
                    } catch (e: Exception) {
                         Log.w(TAG, "Query failed: $e")
                    }
                    return deleted
                }

                // Check standard media collections
                if (deleteFromCollection(android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI)) {
                    promise.resolve(true)
                    return
                }
                if (deleteFromCollection(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI)) {
                    promise.resolve(true)
                    return
                }
                if (deleteFromCollection(android.provider.MediaStore.Audio.Media.EXTERNAL_CONTENT_URI)) {
                    promise.resolve(true)
                    return
                }
                // Finally check generic files collection
                if (deleteFromCollection(android.provider.MediaStore.Files.getContentUri("external"))) {
                    promise.resolve(true)
                    return
                }
            }
            
            // Final check if file is gone (maybe it was deleted but scan failed or race condition)
            if (!File(filePath).exists()) {
                promise.resolve(true)
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
