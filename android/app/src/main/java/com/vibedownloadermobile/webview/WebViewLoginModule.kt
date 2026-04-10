package com.vibedownloadermobile.webview

import android.app.Activity
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * WebViewLoginModule - Launches a sandboxed WebView for platform login
 * After the user logs in, it automatically extracts cookies from the WebView
 * and saves them in Netscape format for yt-dlp to use.
 */
class WebViewLoginModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val NAME = "WebViewLoginModule"
        const val TAG = "WebViewLoginModule"
        const val REQUEST_CODE_WEBVIEW_LOGIN = 9876
    }

    private var pendingPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    /**
     * Open sandboxed WebView for login
     * @param platform - "instagram", "facebook", "tiktok", "youtube"
     */
    @ReactMethod
    fun openLogin(platform: String, promise: Promise) {
        val activity = getCurrentActivity()
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No current activity found")
            return
        }

        // Store promise to resolve after login completes
        pendingPromise = promise

        try {
            val intent = Intent(activity, WebViewLoginActivity::class.java)
            intent.putExtra(WebViewLoginActivity.EXTRA_PLATFORM, platform)
            activity.startActivityForResult(intent, REQUEST_CODE_WEBVIEW_LOGIN)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch WebViewLoginActivity", e)
            promise.reject("LAUNCH_ERROR", "Failed to launch login activity: ${e.message}")
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE_WEBVIEW_LOGIN) return

        val promise = pendingPromise ?: return
        pendingPromise = null

        if (resultCode == Activity.RESULT_OK && data != null) {
            val success = data.getBooleanExtra(WebViewLoginActivity.RESULT_SUCCESS, false)
            val platform = data.getStringExtra(WebViewLoginActivity.RESULT_PLATFORM) ?: ""
            val cookieCount = data.getIntExtra(WebViewLoginActivity.RESULT_COOKIE_COUNT, 0)
            val error = data.getStringExtra(WebViewLoginActivity.RESULT_ERROR)

            if (success) {
                Log.d(TAG, "Login successful for $platform, extracted $cookieCount cookies")

                val result = WritableNativeMap().apply {
                    putBoolean("success", true)
                    putString("platform", platform)
                    putInt("cookieCount", cookieCount)
                }
                promise.resolve(result)

                // Notify React Native about login success
                val params = WritableNativeMap().apply {
                    putString("platform", platform)
                    putBoolean("loggedIn", true)
                    putInt("cookieCount", cookieCount)
                }
                sendEvent("onLoginComplete", params)
            } else {
                promise.reject("LOGIN_FAILED", error ?: "Login failed or was cancelled")
            }
        } else {
            promise.reject("LOGIN_CANCELLED", "Login was cancelled")
        }
    }

    override fun onNewIntent(intent: Intent) {}

    private fun sendEvent(eventName: String, params: WritableMap?) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to send event: ${e.message}")
        }
    }
}
