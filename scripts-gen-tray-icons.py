"""Generate monochrome Electron tray templates from the canonical app icon.

Run ``node scripts-gen-icon.mjs`` first so ``build/icon.png`` reflects
``assets/lingxiloop-logo.svg``. The tray mask keeps the dark avatar body and
turns the light frame and white facial features transparent, which preserves
native macOS light/dark inversion without retaining assumptions from an older
piece of artwork.
"""

from pathlib import Path

from PIL import Image, ImageDraw


SOURCE = Path("build/icon.png")
TARGET_SIZES = {"": 22, "@2x": 44, "@3x": 66}
PADDING = 0.06
BACKGROUND_CUTOFF = 220
OPAQUE_CUTOFF = 80
DOT_CX = 0.86
DOT_CY = 0.16
DOT_R = 0.13


def logo_mask(source: Image.Image) -> Image.Image:
    """Convert dark logo details to alpha and discard the light frame."""
    rgba = source.convert("RGBA")
    grayscale = rgba.convert("L")
    source_alpha = rgba.getchannel("A")
    span = BACKGROUND_CUTOFF - OPAQUE_CUTOFF
    mask = grayscale.point(
        lambda luminance: max(
            0,
            min(255, round((BACKGROUND_CUTOFF - luminance) * 255 / span)),
        )
    )
    return Image.composite(mask, Image.new("L", rgba.size, 0), source_alpha)


def crop_and_fit(mask: Image.Image, target: int) -> Image.Image:
    bbox = mask.getbbox()
    if bbox is None:
        raise SystemExit("canonical icon has no tray-visible pixels")
    cropped = mask.crop(bbox)
    side = max(cropped.size)
    square = Image.new("L", (side, side), 0)
    square.paste(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2))
    inner = max(1, round(target * (1 - 2 * PADDING)))
    square = square.resize((inner, inner), Image.Resampling.LANCZOS)
    output = Image.new("L", (target, target), 0)
    output.paste(square, ((target - inner) // 2, (target - inner) // 2))
    return output


def template_rgba(mask: Image.Image) -> Image.Image:
    output = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    output.putalpha(mask)
    return output


def paint_unread_dot(image: Image.Image) -> None:
    width, height = image.size
    supersampling = 4
    badge = Image.new("L", (width * supersampling, height * supersampling), 0)
    draw = ImageDraw.Draw(badge)
    center_x = DOT_CX * width * supersampling
    center_y = DOT_CY * height * supersampling
    radius = DOT_R * width * supersampling
    draw.ellipse(
        [center_x - radius, center_y - radius, center_x + radius, center_y + radius],
        fill=255,
    )
    badge = badge.resize(image.size, Image.Resampling.LANCZOS)
    image.putalpha(Image.composite(badge, image.getchannel("A"), badge))


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"missing generated canonical icon: {SOURCE}")
    mask = logo_mask(Image.open(SOURCE))
    for suffix, size in TARGET_SIZES.items():
        clean = template_rgba(crop_and_fit(mask, size))
        clean.save(f"build/tray-template{suffix}.png")
        unread = clean.copy()
        paint_unread_dot(unread)
        unread.save(f"build/tray-template-unread{suffix}.png")
        print(f"built tray-template{suffix}.png and unread variant ({size}x{size})")


if __name__ == "__main__":
    main()
