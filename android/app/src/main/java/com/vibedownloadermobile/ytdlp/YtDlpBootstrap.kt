package com.vibedownloadermobile.ytdlp

import android.content.Context
import android.util.Log
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL

/**
 * One-time setup of the bundled python / yt-dlp / ffmpeg packages.
 *
 * Unpacking them takes seconds on a first launch or after an update, so it
 * must never run on the main thread: it used to sit in `Application.onCreate`
 * and held the launch window on screen with nothing drawn before React Native
 * had even started.
 *
 * [ensure] is synchronized and idempotent. `MainApplication` kicks it off on a
 * background thread at process start, and anything that needs yt-dlp before
 * that finishes (a fetch, a download) simply waits on the same lock instead of
 * initializing a second time.
 */
object YtDlpBootstrap {
    private const val TAG = "YtDlpBootstrap"

    @Volatile
    private var done = false

    val isReady: Boolean get() = done

    @Synchronized
    fun ensure(context: Context) {
        if (done) return
        val app = context.applicationContext
        val started = System.currentTimeMillis()

        YoutubeDL.getInstance().init(app)
        try {
            FFmpeg.getInstance().init(app)
        } catch (t: Throwable) {
            try {
                FFmpeg.init(app)
            } catch (t2: Throwable) {
                Log.w(TAG, "FFmpeg fallback init: ${t2.message}")
            }
        }
        Webp16kPatcher.apply(app)

        done = true
        Log.d(TAG, "YoutubeDL & FFmpeg ready in ${System.currentTimeMillis() - started}ms")
    }

    /** Fire-and-forget warm-up on a worker thread. Failures are logged, not thrown. */
    fun warmUpAsync(context: Context) {
        Thread({
            try {
                ensure(context)
            } catch (t: Throwable) {
                Log.e(TAG, "Background init failed; it will be retried on first use", t)
            }
        }, "ytdlp-bootstrap").start()
    }
}
