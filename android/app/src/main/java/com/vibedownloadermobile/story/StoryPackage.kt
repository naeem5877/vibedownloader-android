package com.vibedownloadermobile.story

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.vibedownloadermobile.cookie.CookieModule

class StoryPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        // Create own CookieModule instance using the proper ReactApplicationContext
        val cookieModule = CookieModule(reactContext)
        return listOf(StoryModule(reactContext, cookieModule))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
