# Playlist & Spotify Support

## Features Added
1.  **Spotify Integration**:
    *   Support for Spotify Playlists, Albums, and Tracks.
    *   Uses Spotify API to fetch track lists for Playlists/Albums.
    *   Downloads using YouTube search fallback for high quality audio.
2.  **YouTube Playlists**:
    *   Detects YouTube Playlists.
    *   Fetches metadata efficiently.
    *   Allows selecting specific videos to download.
3.  **Batch Downloading**:
    *   "Select All" / "Deselect All" options.
    *   Downloads multiple files in sequence.
4.  **Audio/Video Toggle**:
    *   Switch between **Video Mode** (Best Quality) and **Audio Mode** (MP3).
    *   Works for Single downloads and Batch Playlist downloads.
5.  **Smart File Naming**:
    *   Files now include ID to prevent overwrites.
    *   Legacy storage automatically renames duplicates (e.g., `Video (1).mp4`).

## Usage
*   **Spotify**: Paste a Spotify link.
    *   **Single Track**: Loads like a normal video. Toggle "Audio" to download as MP3.
    *   **Playlist/Album**: Opens the selection modal. Select tracks and click Download.
*   **YouTube Playlist**: Paste a Playlist URL. Opens selection modal.
*   **Toggle**: Use the [Video | Audio] switch near the input to set your preference.

## Technical Details
*   **Spotify API**: Uses the provided Client ID/Secret.
*   **YtDlp**:
    *   `--flat-playlist` for fast metadata.
    *   `audio_mp3` logic: `-x --audio-format mp3`.
    *   Output Template: `%(title)s [%(id)s].%(ext)s`.
