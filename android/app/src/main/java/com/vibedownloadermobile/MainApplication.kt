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
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.ffmpeg.FFmpeg
import android.util.Log

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
    try {
      YoutubeDL.getInstance().init(this)
      try {
        FFmpeg.getInstance().init(this)
      } catch (t: Throwable) {
        try {
          FFmpeg.init(this)
        } catch (t2: Throwable) {
          Log.w("MainApplication", "FFmpeg init fallback: ${t2.message}")
        }
      }
      Log.d("MainApplication", "YoutubeDL & FFmpeg initialized in Application.onCreate")
    } catch (e: Exception) {
      Log.e("MainApplication", "Failed to initialize YoutubeDL in Application.onCreate", e)
    }
    loadReactNative(this)
  }
}
