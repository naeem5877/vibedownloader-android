package com.vibedownloadermobile.storage

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import java.io.File
import java.io.FileInputStream

/**
 * Writes a file that the user should be able to find later into public storage.
 *
 * Two rules learned the hard way and encoded here:
 *
 *  - On Q+ the generic `Files` collection is used rather than
 *    `MediaStore.Downloads`, because the latter throws "Volume Download not
 *    found" on devices where the Download volume is not registered. The generic
 *    collection still honours `RELATIVE_PATH`.
 *  - A MIME type is only declared when the display name has no extension.
 *    Otherwise MediaStore appends its own and "track.srt" becomes
 *    "track.srt.txt".
 *
 * The source file is always consumed and removed, whether or not the write
 * succeeds.
 */
object MediaStorePublisher {

    private const val TAG = "MediaStorePublisher"

    /**
     * Publishes [source] under `Download/VibeDownloader/[platform/]subfolder`
     * and returns a filesystem path when one can be resolved (so callers can
     * still open the file), otherwise the content Uri. Null on failure.
     */
    fun publish(
        context: Context,
        source: File,
        platform: String?,
        subfolder: String,
        mimeType: String,
        displayName: String? = null,
    ): String? {
        val resolvedName = displayName?.takeIf { it.isNotBlank() } ?: source.name
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                publishViaMediaStore(context, source, platform, subfolder, mimeType, resolvedName)
            } else {
                publishToPublicDir(source, platform, subfolder, resolvedName)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to publish $subfolder file", e)
            null
        } finally {
            try { source.delete() } catch (ignored: Exception) {}
        }
    }

    private fun publishViaMediaStore(
        context: Context,
        source: File,
        platform: String?,
        subfolder: String,
        mimeType: String,
        resolvedName: String,
    ): String? {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, resolvedName)
            val hasExtension = resolvedName.substringAfterLast('.', "").isNotBlank()
            if (!hasExtension) put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(
                MediaStore.MediaColumns.RELATIVE_PATH,
                listOfNotNull(
                    Environment.DIRECTORY_DOWNLOADS,
                    "VibeDownloader",
                    platform?.takeIf { it.isNotBlank() },
                    subfolder,
                ).joinToString("/"),
            )
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }

        val collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = runCatching { resolver.insert(collection, values) }.getOrNull()
            ?: resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        if (uri == null) throw IllegalStateException("MediaStore insert returned null")

        try {
            resolver.openOutputStream(uri)?.use { output ->
                FileInputStream(source).use { it.copyTo(output) }
            } ?: throw IllegalStateException("Could not open the output stream")

            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
        } catch (e: Exception) {
            // Never leave a pending row behind: it is invisible to the user and
            // blocks the display name forever after.
            resolver.delete(uri, null, null)
            throw e
        }

        return resolveMediaStorePath(resolver, uri) ?: uri.toString()
    }

    private fun publishToPublicDir(
        source: File,
        platform: String?,
        subfolder: String,
        resolvedName: String,
    ): String {
        val dir = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            listOfNotNull("VibeDownloader", platform?.takeIf { it.isNotBlank() }, subfolder)
                .joinToString("/"),
        )
        if (!dir.exists() && !dir.mkdirs()) {
            throw IllegalStateException("Could not create $dir")
        }

        val base = resolvedName.substringBeforeLast('.')
        val ext = resolvedName.substringAfterLast('.', source.extension)
        var target = File(dir, resolvedName)
        var suffix = 1
        while (target.exists()) {
            target = File(dir, "$base ($suffix).$ext")
            suffix++
        }

        source.copyTo(target, overwrite = false)
        return target.absolutePath
    }

    /** Best-effort real path for a MediaStore row, for callers that need a File. */
    fun resolveMediaStorePath(resolver: android.content.ContentResolver, uri: Uri): String? {
        return try {
            resolver.query(
                uri,
                arrayOf(MediaStore.MediaColumns.DATA),
                null,
                null,
                null,
            )?.use { cursor ->
                if (!cursor.moveToFirst()) return@use null
                val index = cursor.getColumnIndex(MediaStore.MediaColumns.DATA)
                if (index < 0 || cursor.isNull(index)) null else cursor.getString(index)
            }
        } catch (e: Exception) {
            null
        }
    }
}