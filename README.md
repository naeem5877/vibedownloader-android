# VibeDownloader Mobile

A React Native Android app for downloading media from multiple platforms using yt-dlp.

## Features (V1)

- ✅ URL input with clipboard paste support
- ✅ Platform validation (8 supported platforms)
- ✅ Fetch metadata using yt-dlp JSON mode
- ✅ Display video info with thumbnail, duration, quality
- ✅ Download best available format
- ✅ Real-time progress events
- ✅ Cancel download support
- ✅ Scoped storage (Android 10+)

## Supported Platforms

| Platform | Status |
|----------|--------|
| YouTube | ✅ |
| Instagram | ✅ |
| Facebook | ✅ |
| TikTok | ✅ |
| Spotify | ✅ |
| X (Twitter) | ✅ |
| Pinterest | ✅ |
| SoundCloud | ✅ |

## Project Structure

```
VibeDownloaderMobile/
├── android/
│   └── app/
│       └── src/main/java/com/vibedownloadermobile/
│           ├── MainActivity.kt
│           ├── MainApplication.kt
│           └── ytdlp/
│               ├── YtDlpModule.kt      # Native module (yt-dlp logic)
│               └── YtDlpPackage.kt     # React Native package registration
├── src/
│   ├── components/
│   │   ├── Icons.tsx                   # Platform & UI icons
│   │   ├── PlatformSelector.tsx        # Platform icon selector
│   │   ├── URLInput.tsx                # URL input with paste
│   │   ├── VideoInfoCard.tsx           # Video metadata display
│   │   ├── FormatList.tsx              # Quality selection list
│   │   └── DownloadProgress.tsx        # Progress indicator
│   ├── hooks/
│   │   └── useYtDlp.ts                 # React hook for yt-dlp
│   ├── native/
│   │   └── YtDlpModule.ts              # TypeScript bridge
│   ├── screens/
│   │   └── HomeScreen.tsx              # Main screen
│   └── theme/
│       └── index.ts                    # Design system
├── App.tsx                             # App entry point
└── package.json
```

## Native Module API

### YtDlpModule (Kotlin → React Native)

```typescript
// Fetch video metadata
const info = await YtDlpNative.fetchInfo(url);

// Download with progress
const result = await YtDlpNative.download(url, formatId, processId);

// Cancel download
await YtDlpNative.cancelDownload(processId);

// Validate URL
const { valid, platform } = await YtDlpNative.validateUrl(url);

// Update yt-dlp binary
await YtDlpNative.updateYtDlp();

// List downloaded files
const files = await YtDlpNative.listDownloadedFiles();

// Delete file
await YtDlpNative.deleteFile(filePath);
```

### Progress Events

```typescript
import { onDownloadProgress } from './src/native/YtDlpModule';

const unsubscribe = onDownloadProgress((progress) => {
  console.log(`${progress.progress}% - ETA: ${progress.eta}s`);
});

// Later: unsubscribe();
```

## Installation

### Prerequisites

- Node.js 20+
- Java 17+
- Android SDK (API 24+)
- Android NDK

### Setup

```bash
# Install dependencies
npm install

# Start Metro bundler
npm start

# Build debug APK
npm run android

# Or build directly
cd android && ./gradlew assembleDebug
```

### Build Release APK

```bash
cd android && ./gradlew assembleRelease
```

APKs will be in `android/app/build/outputs/apk/`

## Android Permissions

The app requests these permissions:

```xml
<!-- Network -->
<uses-permission android:name="android.permission.INTERNET" />

<!-- Storage (Android 12 and below) -->
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />

<!-- Android 13+ Media Permissions -->
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />

<!-- Foreground Service -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

<!-- Notifications (Android 13+) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

## Storage Location

Files are saved to scoped storage:
```
/Android/data/com.vibedownloadermobile/files/Movies/
```

This location is accessible without special permissions and survives app updates.

---

## ⚠️ Play Store Risks & Legal Considerations

### Distribution Warnings

1. **Google Play Store Ban**: Apps that download content from YouTube and similar platforms typically violate Google Play's policies. This app is **NOT suitable for Google Play distribution**.

2. **Alternative Distribution**:
   - APK sideloading
   - F-Droid (if open source)
   - GitHub Releases
   - Your own website

### Legal Considerations

1. **Copyright**: Downloading copyrighted content may be illegal in your jurisdiction.

2. **Terms of Service**: Downloading from YouTube, Instagram, etc. may violate their Terms of Service.

3. **Fair Use**: The app is intended for downloading content you have rights to (your own uploads, Creative Commons, etc.).

4. **User Responsibility**: Users are responsible for ensuring they have the right to download content.

### youtubedl-android License

The [youtubedl-android](https://github.com/yausername/youtubedl-android) library is under the **GPL-3.0 license**. If you distribute this app:
- You must also release your source code under GPL-3.0
- You must include the license text
- You must provide access to the source code

### Disclaimer

This software is provided for educational purposes. The developers are not responsible for:
- How users choose to use the app
- Any copyright infringement by users
- Any violation of platform Terms of Service
- Any legal consequences of using this app

---

## Development Notes

### Adding New Platforms

1. Add domain patterns in `YtDlpModule.kt`:
   ```kotlin
   private val SUPPORTED_DOMAINS = listOf(
       // Add new domain here
       "newplatform.com",
   )
   ```

2. Add platform color in `src/theme/index.ts`
3. Add icon in `src/components/Icons.tsx`
4. Update `SUPPORTED_PLATFORMS` array

### Debugging Native Module

```bash
# View Android logs
adb logcat | grep -E "(YtDlpModule|ReactNativeJS)"
```

### Common Issues

1. **"YtDlpModule not found"**: Ensure the package is registered in `MainApplication.kt`

2. **Download fails immediately**: Check internet permission and network connectivity

3. **Progress not updating**: Verify event listener is subscribed before starting download

## Tech Stack

- **React Native** 0.83.1
- **Kotlin** 2.1.20
- **youtubedl-android** 0.18.1 (includes yt-dlp + Python)
- **FFmpeg** (bundled with youtubedl-android)

## License

This project is licensed under GPL-3.0 to comply with youtubedl-android's license.
