package com.vibedownloadermobile.cookie

import android.content.Context
import android.util.Log
import android.webkit.CookieManager
import com.facebook.react.bridge.*
import java.io.File

/**
 * CookieModule - Manages platform cookies for authenticated downloads
 * Saves cookies in Netscape format (compatible with yt-dlp --cookies flag)
 * Extracts cookies from Android WebView's CookieManager automatically
 */
class CookieModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "CookieModule"
        const val TAG = "CookieModule"
        
        // Platform URL map for cookie extraction
        val PLATFORM_URLS = mapOf(
            "instagram" to listOf("https://www.instagram.com", "https://instagram.com"),
            "facebook" to listOf("https://www.facebook.com", "https://m.facebook.com", "https://web.facebook.com"),
            "tiktok" to listOf("https://www.tiktok.com", "https://tiktok.com"),
            "youtube" to listOf("https://www.youtube.com", "https://youtube.com"),
            "twitter" to listOf("https://twitter.com", "https://x.com")
        )
        
        val PLATFORM_DOMAINS = mapOf(
            "instagram" to listOf(".instagram.com", "instagram.com"),
            "facebook" to listOf(".facebook.com", "facebook.com", ".fb.com"),
            "tiktok" to listOf(".tiktok.com", "tiktok.com"),
            "youtube" to listOf(".youtube.com", "youtube.com", ".googlevideo.com"),
            "twitter" to listOf(".twitter.com", "twitter.com", ".x.com", "x.com")
        )
    }

    override fun getName(): String = NAME

    /**
     * Get the app's shared cookie directory.
     * Uses context.filesDir so both CookieModule and WebViewLoginActivity
     * resolve to the same physical path.
     */
    fun getCookiesDir(context: android.content.Context = reactApplicationContext): File {
        val dir = File(context.filesDir, "platform_cookies")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    fun getCookieFilePath(platform: String, context: android.content.Context = reactApplicationContext): String {
        return File(getCookiesDir(context), "${platform}_cookies.txt").absolutePath
    }

    /**
     * Check if cookies exist for a platform
     */
    @ReactMethod
    fun hasCookies(platform: String, promise: Promise) {
        try {
            val file = File(getCookieFilePath(platform))
            val exists = file.exists() && file.length() > 100
            val result = WritableNativeMap().apply {
                putBoolean("exists", exists)
                putString("path", if (exists) file.absolutePath else null)
                putDouble("size", if (exists) file.length().toDouble() else 0.0)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("COOKIE_ERROR", e.message)
        }
    }

    /**
     * Extract cookies from Android WebView's CookieManager for a platform
     * Must be called after user logs in via the WebView
     */
    @ReactMethod
    fun extractWebViewCookies(platform: String, promise: Promise) {
        try {
            val cookieManager = CookieManager.getInstance()
            val urls = PLATFORM_URLS[platform.lowercase()] ?: emptyList()
            val domains = PLATFORM_DOMAINS[platform.lowercase()] ?: emptyList()
            
            if (urls.isEmpty()) {
                promise.reject("UNSUPPORTED_PLATFORM", "Platform '$platform' is not supported for cookie extraction")
                return
            }

            val cookieLines = StringBuilder()
            cookieLines.appendLine("# Netscape HTTP Cookie File")
            cookieLines.appendLine("# Extracted by VibeDownloader for $platform")
            cookieLines.appendLine("# This file is used by yt-dlp for authenticated downloads")
            cookieLines.appendLine()

            var cookieCount = 0
            val processedCookieNames = mutableSetOf<String>()
            
            for (url in urls) {
                val rawCookies = cookieManager.getCookie(url) ?: continue
                Log.d(TAG, "Raw cookies for $url: ${rawCookies.take(200)}...")
                
                // Parse the cookie string (format: "name=value; name2=value2; ...")
                val cookiePairs = rawCookies.split(";").map { it.trim() }
                
                for (pair in cookiePairs) {
                    if (pair.isBlank() || !pair.contains("=")) continue
                    
                    val eqIndex = pair.indexOf('=')
                    val name = pair.substring(0, eqIndex).trim()
                    val value = pair.substring(eqIndex + 1).trim()

                    if (name.isBlank() || processedCookieNames.contains(name)) continue
                    processedCookieNames.add(name)

                    // Write in Netscape format: domain, flag, path, secure, expiry, name, value
                    // Use the primary domain for the platform
                    val domain = domains.firstOrNull() ?: ".${url.removePrefix("https://").removePrefix("http://").split("/")[0]}"
                    val isSecure = url.startsWith("https://")
                    val expiry = (System.currentTimeMillis() / 1000) + (365 * 24 * 3600) // 1 year
                    
                    cookieLines.appendLine("$domain\tTRUE\t/\t${if (isSecure) "TRUE" else "FALSE"}\t$expiry\t$name\t$value")
                    cookieCount++
                }
            }

            if (cookieCount == 0) {
                promise.reject("NO_COOKIES", "No cookies found for $platform. Please log in first.")
                return
            }

            // Save to file
            val cookieFile = File(getCookieFilePath(platform))
            cookieFile.writeText(cookieLines.toString())

            Log.d(TAG, "Saved $cookieCount cookies for $platform to ${cookieFile.absolutePath}")

            val result = WritableNativeMap().apply {
                putBoolean("success", true)
                putInt("cookieCount", cookieCount)
                putString("path", cookieFile.absolutePath)
                putString("platform", platform)
            }
            promise.resolve(result)

        } catch (e: Exception) {
            Log.e(TAG, "Cookie extraction failed", e)
            promise.reject("EXTRACT_ERROR", "Failed to extract cookies: ${e.message}")
        }
    }

    /**
     * Save manually provided cookies (Netscape format or JSON format)  
     */
    @ReactMethod
    fun saveCookies(platform: String, cookieContent: String, promise: Promise) {
        try {
            if (cookieContent.trim().isEmpty()) {
                promise.reject("EMPTY_COOKIES", "Cookie content cannot be empty")
                return
            }
            
            val cookieFile = File(getCookieFilePath(platform))
            val content = if (!cookieContent.contains("# Netscape")) {
                "# Netscape HTTP Cookie File\n# Manually provided cookies for $platform\n\n$cookieContent"
            } else {
                cookieContent
            }
            cookieFile.writeText(content)
            
            val result = WritableNativeMap().apply {
                putBoolean("success", true)
                putString("path", cookieFile.absolutePath)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SAVE_ERROR", e.message)
        }
    }

    /**
     * Delete cookies for a platform
     */
    @ReactMethod
    fun deleteCookies(platform: String, promise: Promise) {
        try {
            val file = File(getCookieFilePath(platform))
            val deleted = if (file.exists()) file.delete() else true
            
            // Also clear from WebView CookieManager
            val urls = PLATFORM_URLS[platform.lowercase()] ?: emptyList()
            val cookieManager = CookieManager.getInstance()
            for (url in urls) {
                // Remove individual cookies for this URL
                val rawCookies = cookieManager.getCookie(url) ?: continue
                val cookiePairs = rawCookies.split(";").map { it.trim() }
                for (pair in cookiePairs) {
                    if (pair.contains("=")) {
                        val name = pair.substringBefore("=").trim()
                        cookieManager.setCookie(url, "$name=; expires=Thu, 01 Jan 1970 00:00:00 GMT")
                    }
                }
            }
            cookieManager.flush()

            promise.resolve(deleted)
        } catch (e: Exception) {
            promise.reject("DELETE_ERROR", e.message)
        }
    }

    /**
     * Get the cookies file path for passing to yt-dlp
     */
    @ReactMethod
    fun getCookiePath(platform: String, promise: Promise) {
        try {
            val file = File(getCookieFilePath(platform))
            if (!file.exists() || file.length() < 50) {
                promise.resolve(null)
            } else {
                promise.resolve(file.absolutePath)
            }
        } catch (e: Exception) {
            promise.resolve(null)
        }
    }

    /**
     * Get status of all platform cookies
     */
    @ReactMethod
    fun getAllCookieStatus(promise: Promise) {
        try {
            val result = WritableNativeMap()
            for (platform in PLATFORM_URLS.keys) {
                val file = File(getCookieFilePath(platform))
                val platformMap = WritableNativeMap().apply {
                    putBoolean("exists", file.exists() && file.length() > 100)
                    putDouble("size", if (file.exists()) file.length().toDouble() else 0.0)
                }
                result.putMap(platform, platformMap)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("STATUS_ERROR", e.message)
        }
    }
}
