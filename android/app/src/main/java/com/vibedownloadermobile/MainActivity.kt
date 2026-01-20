package com.vibedownloadermobile

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.core.DeviceEventManagerModule

class MainActivity : ReactActivity() {
    
    companion object {
        // Store shared data for React Native to retrieve
        @Volatile
        var pendingSharedUrl: String? = null
        @Volatile
        var pendingPlatform: String? = null
    }

    /**
     * Returns the name of the main component registered from JavaScript.
     */
    override fun getMainComponentName(): String = "VibeDownloaderMobile"

    /**
     * Returns the instance of the [ReactActivityDelegate].
     */
    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent?.let { handleIntent(it) }
    }

    private fun handleIntent(intent: Intent) {
        val action = intent.action
        val type = intent.type

        if (Intent.ACTION_SEND == action && type != null) {
            if ("text/plain" == type) {
                intent.getStringExtra(Intent.EXTRA_TEXT)?.let { sharedText ->
                    // Extract URL from shared text
                    val urlMatch = Regex("(https?://[^\\s]+)").find(sharedText)
                    val url = urlMatch?.value

                    if (url != null) {
                        pendingSharedUrl = url
                        pendingPlatform = detectPlatform(url)
                        
                        // Try to send event to React Native if bridge is ready
                        sendShareEventToReact(url, pendingPlatform)
                    }
                }
            }
        }
    }

    private fun detectPlatform(url: String): String {
        val hostLower = try {
            java.net.URI(url).host?.lowercase() ?: ""
        } catch (e: Exception) { "" }

        return when {
            hostLower.contains("youtube") || hostLower.contains("youtu.be") -> "YouTube"
            hostLower.contains("instagram") -> "Instagram"
            hostLower.contains("facebook") || hostLower.contains("fb.") -> "Facebook"
            hostLower.contains("tiktok") -> "TikTok"
            hostLower.contains("spotify") -> "Spotify"
            hostLower.contains("twitter") || hostLower.contains("x.com") -> "X"
            hostLower.contains("pinterest") || hostLower.contains("pin.it") -> "Pinterest"
            hostLower.contains("soundcloud") -> "SoundCloud"
            else -> "Unknown"
        }
    }

    private fun sendShareEventToReact(url: String, platform: String?) {
        try {
            val reactContext = reactInstanceManager?.currentReactContext
            if (reactContext != null && reactContext.hasActiveReactInstance()) {
                val params = Arguments.createMap().apply {
                    putString("url", url)
                    putString("platform", platform)
                    putBoolean("autoFetch", true)
                }
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onShareReceived", params)
            }
        } catch (e: Exception) {
            // React bridge not ready yet, will use pendingSharedUrl
        }
    }
}
