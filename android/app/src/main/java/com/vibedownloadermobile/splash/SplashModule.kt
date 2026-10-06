package com.vibedownloadermobile.splash

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager
import com.vibedownloadermobile.MainActivity

/**
 * The native launch splash stays up until the JS splash has drawn its first
 * frame, then hands over. Without this the system splash disappears as soon as
 * the (still empty) React root is attached, leaving a blank window until JS
 * renders.
 */
class SplashModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SplashModule"

    @ReactMethod
    fun hide() {
        MainActivity.jsSplashShown = true
    }
}

class SplashPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(SplashModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
