"""
Generates every Android launcher / splash raster from transparent_logo.png.

    python scripts/gen-android-icons.py

Outputs (under android/app/src/main/res):
  mipmap-*/ic_launcher_foreground.png   adaptive foreground (108dp canvas, logo in the safe zone)
  mipmap-*/ic_launcher_monochrome.png   same silhouette in white, for Android 13 themed icons
  mipmap-*/ic_launcher.png              legacy rounded-square icon (API 24-25)
  mipmap-*/ic_launcher_round.png        legacy round icon (API 24-25)
  drawable-*/splash_logo.png            native splash icon (288dp canvas, logo drawn at the
                                        same 96dp the JS splash uses, so the hand-off is seamless)
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"
BG = (10, 10, 12, 255)  # #0A0A0C, same as the splash / launcher background

DENSITY = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}

logo_full = Image.open(ROOT / "transparent_logo.png").convert("RGBA")
# Tight crop so sizing is predictable no matter how much padding the source has.
logo = logo_full.crop(logo_full.getchannel("A").getbbox())


def fit(img: Image.Image, target_w: float) -> Image.Image:
    w = max(1, round(target_w))
    h = max(1, round(img.height * w / img.width))
    return img.resize((w, h), Image.LANCZOS)


def centered(canvas_px: int, img: Image.Image) -> Image.Image:
    out = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    out.alpha_composite(img, ((canvas_px - img.width) // 2, (canvas_px - img.height) // 2))
    return out


def silhouette(img: Image.Image) -> Image.Image:
    white = Image.new("RGBA", img.size, (255, 255, 255, 255))
    white.putalpha(img.getchannel("A"))
    return white


for name, scale in DENSITY.items():
    mip = RES / f"mipmap-{name}"
    drw = RES / f"drawable-{name}"
    mip.mkdir(parents=True, exist_ok=True)
    drw.mkdir(parents=True, exist_ok=True)

    # --- adaptive layers: 108dp canvas, logo ~54dp wide (inside the 66dp safe zone)
    canvas = round(108 * scale)
    fg_logo = fit(logo, 54 * scale)
    centered(canvas, fg_logo).save(mip / "ic_launcher_foreground.png")
    centered(canvas, silhouette(fg_logo)).save(mip / "ic_launcher_monochrome.png")

    # --- legacy icons: 48dp, logo ~30dp wide on the dark background
    px = round(48 * scale)
    legacy_logo = fit(logo, 30 * scale)

    square = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    ImageDraw.Draw(square).rounded_rectangle((0, 0, px - 1, px - 1), radius=round(px * 0.22), fill=BG)
    square.alpha_composite(legacy_logo, ((px - legacy_logo.width) // 2, (px - legacy_logo.height) // 2))
    square.save(mip / "ic_launcher.png")

    rnd = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    ImageDraw.Draw(rnd).ellipse((0, 0, px - 1, px - 1), fill=BG)
    rnd.alpha_composite(legacy_logo, ((px - legacy_logo.width) // 2, (px - legacy_logo.height) // 2))
    rnd.save(mip / "ic_launcher_round.png")

    # --- native splash icon: 288dp canvas, the whole source image drawn at 96dp
    # exactly like <Image style={{width: 96, height: 96}}> in SplashScreen.tsx.
    splash = centered(round(288 * scale), logo_full.resize((round(96 * scale),) * 2, Image.LANCZOS))
    splash.save(drw / "splash_logo.png")

print("done")
