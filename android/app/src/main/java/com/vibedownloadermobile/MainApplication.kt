package com.vibedownloadermobile

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.vibedownloadermobile.ytdlp.YtDlpPackage
import com.vibedownloadermobile.ytdlp.YtDlpBootstrap
import com.vibedownloadermobile.splash.SplashPackage
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
          // Lets the JS splash tell the native launch splash it can hand over
          add(SplashPackage())
        },
    )
  }


  override fun onCreate() {
    super.onCreate()
    // Unpacking python/ffmpeg takes seconds on a first launch or after an
    // update. Doing it here on the main thread kept the launch window blank
    // before React Native had even started, so it runs on a worker instead;
    // anything that needs yt-dlp early waits on the same lock (YtDlpBootstrap).
    YtDlpBootstrap.warmUpAsync(this)
    loadReactNative(this)
  }
}
