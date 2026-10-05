package com.vibedownloadermobile.ytdlp

import android.content.Context
import android.util.Log
import java.io.File
import java.io.RandomAccessFile

/**
 * Replaces the libwebp family inside youtubedl-android's unpacked ffmpeg
 * package with copies linked for 16 KB memory pages.
 *
 * The ffmpeg package ships libwebp, libwebpdemux, libwebpmux, libwebpdecoder
 * and libsharpyuv aligned to 4 KB. Every other library and the ffmpeg binaries
 * are already 16 KB-aligned, so these five are the only thing that makes
 * ffmpeg fail to start on a 16 KB-page device. They are rebuilt from libwebp
 * 1.4.0 with the same plain sonames the bundled ffmpeg expects and shipped in
 * `assets/webp16k/<abi>/`.
 *
 * Safe to call on every launch: files are only rewritten when they differ, so
 * it costs a few `stat` calls once patched, and it re-applies itself if an
 * app update makes the library unpack a fresh, unpatched package.
 */
object Webp16kPatcher {
    private const val TAG = "Webp16kPatcher"
    private const val ASSET_ROOT = "webp16k"

    private const val EM_X86_64 = 0x3E
    private const val EM_AARCH64 = 0xB7

    fun apply(context: Context) {
        try {
            val libDir = File(
                context.noBackupFilesDir,
                "youtubedl-android/packages/ffmpeg/usr/lib"
            )
            if (!libDir.isDirectory) return // nothing unpacked (yet)

            val abi = detectAbi(libDir) ?: return // 32-bit ABIs have no 16 KB devices
            val assetDir = "$ASSET_ROOT/$abi"
            val names = context.assets.list(assetDir)?.filter { it.endsWith(".so") }.orEmpty()

            var patched = 0
            for (name in names) {
                val target = File(libDir, name)
                // openFd() fails on compressed assets, so measure by reading.
                val size = context.assets.open("$assetDir/$name").use { input ->
                    val buf = ByteArray(64 * 1024)
                    var total = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        total += n
                    }
                    total
                }
                if (target.isFile && target.length() == size) continue

                val tmp = File(libDir, "$name.tmp")
                context.assets.open("$assetDir/$name").use { input ->
                    tmp.outputStream().use { input.copyTo(it) }
                }
                tmp.setReadable(true, false)
                if (!tmp.renameTo(target)) {
                    target.delete()
                    if (!tmp.renameTo(target)) {
                        tmp.delete()
                        Log.w(TAG, "could not replace $name")
                        continue
                    }
                }
                patched++
            }
            if (patched > 0) Log.i(TAG, "replaced $patched libwebp libraries ($abi) with 16 KB-aligned builds")
        } catch (t: Throwable) {
            // Never let a patch problem take the app down; ffmpeg just stays as shipped.
            Log.w(TAG, "patch skipped: ${t.message}")
        }
    }

    /** Reads the CPU type from an unpacked library's ELF header. */
    private fun detectAbi(libDir: File): String? {
        val probe = libDir.listFiles { f -> f.isFile && f.name.endsWith(".so") }?.firstOrNull() ?: return null
        return try {
            RandomAccessFile(probe, "r").use { f ->
                val header = ByteArray(20)
                f.readFully(header)
                val machine = (header[18].toInt() and 0xFF) or ((header[19].toInt() and 0xFF) shl 8)
                when (machine) {
                    EM_AARCH64 -> "arm64-v8a"
                    EM_X86_64 -> "x86_64"
                    else -> null
                }
            }
        } catch (e: Exception) {
            null
        }
    }
}
