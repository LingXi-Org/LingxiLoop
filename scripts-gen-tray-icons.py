"""Regenerate the system-tray template PNGs from public/logo.png.

The brand cloud already lives in public/logo.png on a true alpha-
transparent background (the two accent bubbles are separate connected
components, the cloud is the largest by a 10× margin). Recipe:

  1. Take alpha → keep the largest connected component (drops the
     two accent bubbles, keeps the cloud body).
  2. Carve the face features (eyes + smile) out of the silhouette as
     transparent holes by detecting the very-low-luminance pixels
     inside the cloud (eyes/mouth are near-black, lum < 60; cloud
     body rim is lum > 140, so the threshold is unambiguous).
  3. Zero RGB / keep alpha for macOS template-image semantics.
  4. Downsample to 22 / 44 / 66 px for menu-bar 1×/2×/3× density.

Why script-time and not at runtime in main.cjs:
  • Largest-CC + feature carving is O(width·height) — fine at build
    time, wasteful on every Electron boot. Once baked,
    nativeImage.createFromPath is instant and Electron auto-picks
    @2x/@3x siblings.
  • A baked asset survives logo edits cleanly — re-run this script
    after touching public/logo.png and the menu bar tracks.

Requirements: Pillow. Run from repo root.
"""
from PIL import Image, ImageDraw, ImageFilter
from collections import deque
import os
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

SOURCE = 'public/logo.png'
WORK = 512        # work resolution before final downsample
TARGET_SIZES = {  # output filename suffix → pixel size
    '':    22,
    '@2x': 44,
    '@3x': 66,
}
PADDING = 0.06    # 6% margin around the silhouette in the tray canvas
DOT_CX = 0.86     # unread badge — coords are fraction of tray size
DOT_CY = 0.16
DOT_R  = 0.13

# ---------------------------------------------------------------------- helpers
def largest_alpha_component(img):
    """Return a new L-mode mask containing only the largest connected
    component of the source alpha channel, preserving the original
    alpha values (so anti-aliased edges survive)."""
    w, h = img.size
    alpha = img.split()[-1]
    apx = alpha.load()
    visited = [[False] * w for _ in range(h)]
    best = []
    for sy in range(h):
        for sx in range(w):
            if visited[sy][sx] or apx[sx, sy] < 32:
                continue
            comp = []
            q = deque([(sx, sy)])
            visited[sy][sx] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and apx[nx, ny] >= 32:
                        visited[ny][nx] = True
                        q.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    out = Image.new('L', (w, h), 0)
    op = out.load()
    for x, y in best:
        op[x, y] = apx[x, y]
    return out

# Face features (eyes + smile) inside the cloud body are dark — near
# pure black with luminance around 10–35. The cloud's darkest shaded
# rim sits around lum=140 so the threshold has a wide safety margin.
# Soft band gives sub-pixel anti-aliasing at the feature outlines so
# the eyes/mouth read as crisp ovals after downsampling, not blocky.
FEATURE_LUM_THRESHOLD = 60
FEATURE_LUM_SOFT = 30

def carve_face_features(mask, src):
    """Punch the eye/mouth pixels through the cloud silhouette mask so
    they render as transparent holes in the macOS template image.

    `mask` is the cloud silhouette (L-mode alpha). `src` is the source
    RGBA. We scale the carve by the existing mask alpha so we don't
    punch outside the cloud body — only features that already sit on
    opaque cloud pixels become holes."""
    w, h = mask.size
    mp = mask.load()
    sp = src.load()
    for y in range(h):
        for x in range(w):
            cur = mp[x, y]
            if cur == 0:
                continue
            r, g, b, _ = sp[x, y]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum >= FEATURE_LUM_THRESHOLD + FEATURE_LUM_SOFT:
                continue  # bright pixel — keep cloud body intact
            # carve_strength: 1 at pitch black, fading to 0 at the
            # outer edge of the threshold band. Multiplies into the
            # existing alpha so the carve respects mask edges.
            t = (FEATURE_LUM_THRESHOLD + FEATURE_LUM_SOFT - lum) / (2 * FEATURE_LUM_SOFT)
            carve = max(0.0, min(1.0, t))
            new_alpha = round(cur * (1 - carve))
            mp[x, y] = new_alpha

def crop_and_fit(mask, target, padding):
    """Crop to bbox, pad to a square, scale into `target`-px canvas with
    `padding` margin on each side. Result is a target×target L mask."""
    bbox = mask.getbbox()
    if bbox is None:
        raise SystemExit('source has no opaque pixels')
    cropped = mask.crop(bbox)
    bw, bh = cropped.size
    side = max(bw, bh)
    square = Image.new('L', (side, side), 0)
    square.paste(cropped, ((side - bw) // 2, (side - bh) // 2))
    inner = round(target * (1 - 2 * padding))
    inner = max(1, inner)
    square = square.resize((inner, inner), Image.LANCZOS)
    out = Image.new('L', (target, target), 0)
    out.paste(square, ((target - inner) // 2, (target - inner) // 2))
    return out

def template_rgba(mask):
    """Wrap an alpha mask as black-on-transparent RGBA, ready for
    macOS template-image semantics."""
    w, h = mask.size
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    op = out.load()
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            a = mp[x, y]
            if a > 0:
                op[x, y] = (0, 0, 0, a)
    return out

def paint_dot(rgba):
    """Paint the unread-badge dot in the upper-right. Same pure black
    so the result stays template-friendly."""
    w, h = rgba.size
    cx, cy, r = DOT_CX * w, DOT_CY * h, DOT_R * w
    # Anti-aliased dot via PIL.Draw at 4× then resize. Cheap, sharp.
    SS = 4
    big = Image.new('L', (w * SS, h * SS), 0)
    d = ImageDraw.Draw(big)
    d.ellipse([
        (cx - r) * SS, (cy - r) * SS,
        (cx + r) * SS, (cy + r) * SS,
    ], fill=255)
    big = big.resize((w, h), Image.LANCZOS)
    bp = big.load()
    op = rgba.load()
    for y in range(h):
        for x in range(w):
            a_dot = bp[x, y]
            if a_dot == 0:
                continue
            _, _, _, a_cur = op[x, y]
            op[x, y] = (0, 0, 0, max(a_cur, a_dot))

# ---------------------------------------------------------------------- main
def main():
    src = Image.open(SOURCE).convert('RGBA')
    src = src.resize((WORK, WORK), Image.LANCZOS)
    mask = largest_alpha_component(src)
    carve_face_features(mask, src)
    for suffix, size in TARGET_SIZES.items():
        clean = template_rgba(crop_and_fit(mask, size, PADDING))
        clean.save(f'build/tray-template{suffix}.png')
        unread = clean.copy()
        paint_dot(unread)
        unread.save(f'build/tray-template-unread{suffix}.png')
        print(f'  built tray-template{suffix}.png + unread variant ({size}x{size})')

if __name__ == '__main__':
    main()
