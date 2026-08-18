"""
Composite the transparent cloud master into a macOS-style app icon.

The output keeps the standard 1024×1024 icon canvas, but the rounded tile sits
inside a transparent outer margin. macOS app icons should not make the visible
rounded square consume the full bitmap; otherwise the app looks oversized in
Finder, Launchpad, and the Dock compared with system app icons.

The transparent cloud master is saved separately at build/icon.src.png so
future edits keep the no-background source intact.
"""
from PIL import Image, ImageDraw
import os, shutil
import numpy as np

SIZE = 1024
TILE_INSET = 88                  # 848px tile in a 1024px macOS icon canvas.
TILE_SIZE = SIZE - TILE_INSET * 2
RADIUS = round(TILE_SIZE * 0.225)
ARTWORK_SCALE = 1.0              # Fill the tile with the source composition.
LOGO_SIZE = 512
LOGO_PADDING = 24

# 1. Preserve transparent cloud master if not already saved.
if not os.path.exists('build/icon.src.png'):
    shutil.copy('build/icon.png', 'build/icon.src.png')
    print('[mac-icon] saved transparent master → build/icon.src.png')

cloud = Image.open('build/icon.src.png').convert('RGBA')

# Keep a standalone transparent logo for in-app branding. This is intentionally
# separate from the app icon so compact header/logo uses do not inherit the
# rounded-square tile.
alpha_bbox = cloud.getchannel('A').getbbox()
if alpha_bbox:
    logo = cloud.crop(alpha_bbox)
    logo_canvas = Image.new('RGBA', (LOGO_SIZE, LOGO_SIZE), (0, 0, 0, 0))
    logo_inner = LOGO_SIZE - LOGO_PADDING * 2
    logo_ratio = logo.width / logo.height
    if logo_ratio >= 1:
        logo_w = logo_inner
        logo_h = round(logo_inner / logo_ratio)
    else:
        logo_h = logo_inner
        logo_w = round(logo_inner * logo_ratio)
    logo_r = logo.resize((logo_w, logo_h), Image.LANCZOS)
    logo_canvas.alpha_composite(logo_r, dest=((LOGO_SIZE - logo_w) // 2, (LOGO_SIZE - logo_h) // 2))
    logo_canvas.save('public/logo.png', optimize=True)
    print('[mac-icon] wrote public/logo.png (transparent standalone logo)')

# 2. Pale sky-blue tile background — sky-50 → sky-100 vertical gradient.
# Matches Cumora's palette tokens so the icon feels of-a-piece with the
# app chrome instead of generic-white. No elliptical sheen or shadow
# blobs — those read as cloud shapes and clash with the cloud subject.
ys = np.arange(TILE_SIZE).reshape(-1, 1) / (TILE_SIZE - 1)
top    = np.array([242, 250, 254], dtype=np.float32)  # --sky-50  #F2FAFE
bottom = np.array([225, 243, 253], dtype=np.float32)  # --sky-100 #E1F3FD
col = (top + (bottom - top) * ys).astype(np.uint8)
grad = np.broadcast_to(col[:, None, :], (TILE_SIZE, TILE_SIZE, 3)).copy()
alpha = np.full((TILE_SIZE, TILE_SIZE, 1), 255, dtype=np.uint8)
bg = Image.fromarray(np.concatenate([grad, alpha], axis=2), 'RGBA')

# 3. Place the source composition inside the tile, preserving its transparent
# breathing room. Cropping to the alpha bbox makes the character too large.
art_size = round(TILE_SIZE * ARTWORK_SCALE)
cloud_ratio = cloud.width / cloud.height
if cloud_ratio >= 1:
    new_w = art_size
    new_h = round(art_size / cloud_ratio)
else:
    new_h = art_size
    new_w = round(art_size * cloud_ratio)
cloud_r = cloud.resize((new_w, new_h), Image.LANCZOS)
cx = (TILE_SIZE - new_w) // 2
cy = (TILE_SIZE - new_h) // 2
bg.alpha_composite(cloud_r, dest=(cx, cy))

# 4. Apply the tile mask inside the transparent 1024px canvas.
mask = Image.new('L', (TILE_SIZE, TILE_SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle([(0, 0), (TILE_SIZE - 1, TILE_SIZE - 1)], radius=RADIUS, fill=255)
out = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
out.paste(bg, (TILE_INSET, TILE_INSET), mask)

out.save('build/icon.png', optimize=True)
print(f'[mac-icon] wrote build/icon.png ({TILE_SIZE}×{TILE_SIZE} tile in {SIZE}×{SIZE} canvas)')
