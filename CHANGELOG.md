# Changelog

All notable changes to VibeDownloader for Android are documented here.

## [2.2.0] - 2026-10-30

### 🎨 Redesign
- **Monochrome white-on-black theme**: New theme across all screens, with a platform-tinted glow on the download button and a brighter bottom-nav top edge.
- **Ambient glow and motion**: New `AmbientGlow` and `Motion` components added.
- **Tile previews**: New `TilePreview` component added.
- **Status bar scrim**: New `StatusBarScrim` so content stays readable under the status bar.
- **Edge-to-edge display**: Enabled edge-to-edge in `gradle.properties` and set transparent system bars in `styles.xml`. Each screen pads itself with the safe-area insets.
- **Skeleton, progress, queue and format list** components restyled to match the new theme.

### ✂️ Editor & Library
- **In-app media editor**: Redesigned GIF picker and editing flow in the Library.
- **Cut & Download**: Redesigned sheet and timeline (`CutDownloadSheet`, `CutTimeline`).
- **Playlists**: New `YouTubePlaylistService` and redesigned playlist selection modal.

### 📥 Downloads
- **Live progress fix**: `useYtDlp` now keeps the last known speed, size and raw yt-dlp line when an update omits them, so progress no longer blanks between events.
- **Batch download sheet and queue panel** updated.
- **Resolution helper**: New `utils/resolution.ts` for quality labels.
- **Spotify**: `SpotifyService` reworked.

### 🛠️ Fixes & Maintenance
- **Release notes emoji**: `release.yml` had lost its emoji (saved as `?`). Restored them.
- **Native**: `MainActivity`, `StoryModule` and `YtDlpModule` updated.
- **README**: New banner and screenshot gallery in `Screenshots/final/`. Removed the old `screenshot1-8.jpeg` and `Screenshot_*.png` files.

## [2.1.0]

Previous release. See the [GitHub releases page](https://github.com/naeem5877/vibedownloader-android/releases).
