# 🎵 TikTok Theme & UI Update

We've given the app a massive facelift to match the **TikTok** aesthetic and added requested features.

## 🎨 New Theme: "VibeTok"
- **Background:** Deep Pure Black (`#010101`) - True dark mode.
- **Primary Color:** TikTok Red/Pink (`#FE2C55`).
- **Accent Color:** TikTok Cyan/Aqua (`#25F4EE`).
- **Surface:** Sleek Dark Grey (`#121212`) for cards.

## 🖼️ Video Preview Images
- **Thumbnails are here!**
- When you download a video, we now automatically extract its thumbnail.
- These thumbnails appear in your **Library** tab instead of the generic icon.
- **Clean Gallery:** Thumbnails are stored in the app's private storage so they don't clutter your main Gallery (only the videos/images do).

## ⌨️ Modern Input Section
- **Cleaner Design:** Removed the glow effect for a sharper, more modern look.
- **Taller Input:** Increased height to **60px** for easier tapping.
- **Pill Shape:** Rounded corners with a solid 2px border that lights up **Cyan** when focused.
- **Premium Buttons:** The "Paste" and "Go" buttons now use the new color palette.

## 🛠️ How to Apply Changes
Since we updated the native download logic to handle thumbnails, you **MUST** rebuild the app:

```bash
cd android
./gradlew clean assembleRelease
```
Or for debug:
```bash
npx react-native run-android
```

Enjoy the new vibe! 🚀
