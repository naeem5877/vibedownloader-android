package com.vibedownloadermobile

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.vibedownloadermobile.ytdlp.YtDlpPackage
import com.vibedownloadermobile.cookie.CookiePackage
import com.vibedownloadermobile.story.StoryPackage
import com.vibedownloadermobile.webview.WebViewLoginPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Core download functionality
          add(YtDlpPackage())
          // Cookie management for authenticated downloads
          add(CookiePackage())
          // Story fetching for Instagram & Facebook (StoryPackage creates its CookieModule instance internally)
          add(StoryPackage())
          // WebView login to automatically extract cookies
          add(WebViewLoginPackage())
        },
    )
  }


  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
