import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import test from 'node:test'
import { load } from 'cheerio'

// Decode the shipped RGBA pixels, rather than trusting CSS or SVG metadata.
function pngPixels(path: string) {
  const file = readFileSync(path)
  const width = file.readUInt32BE(16), height = file.readUInt32BE(20), depth = file[24]
  assert.equal(file[25], 6, `${path}: expected RGBA`)
  assert.ok(depth === 8 || depth === 16)
  const parts: Buffer[] = []
  for (let offset = 8; offset < file.length;) {
    const length = file.readUInt32BE(offset)
    if (file.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(file.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const raw = inflateSync(Buffer.concat(parts)), pixelBytes = depth / 8 * 4, stride = width * pixelBytes
  const pixels = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const left = x >= pixelBytes ? pixels[y * stride + x - pixelBytes] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upperLeft = y > 0 && x >= pixelBytes ? pixels[(y - 1) * stride + x - pixelBytes] : 0
      const prediction = left + up - upperLeft
      const distances = [Math.abs(prediction - left), Math.abs(prediction - up), Math.abs(prediction - upperLeft)]
      const paeth = distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? up : upperLeft
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth][filter]
      assert.notEqual(predictor, undefined, `${path}: unsupported PNG filter`)
      pixels[y * stride + x] = raw[y * (stride + 1) + 1 + x] + predictor
    }
  }
  const alpha = (x: number, y: number) => {
    const offset = (y * width + x) * pixelBytes + depth / 8 * 3
    return depth === 8 ? pixels[offset] / 255 : pixels.readUInt16BE(offset) / 65535
  }
  return { width, height, alpha }
}
function rounded(path: string, width: number, height: number, alpha: (x: number, y: number) => number, maximumCornerAlpha = 0) {
  for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]) assert.ok(alpha(x, y) <= maximumCornerAlpha, `${path}: corner ${x},${y} must be transparent`)
  assert.ok(alpha(Math.floor(width / 2), 0) > .95, `${path}: top edge should retain the mark's full extent`)
  assert.ok(alpha(Math.floor(width / 2), Math.floor(height / 2)) > .95, `${path}: logo center must remain opaque`)
}

test('actual app tab and manifest PNGs retain transparent rounded corners at each size', () => {
  for (const [path, size] of [['public/favicon-32.png', 32], ['public/icon-192.png', 192], ['public/icon.png', 512]] as const) {
    const image = pngPixels(path)
    assert.equal(image.width, size); assert.equal(image.height, size)
    rounded(path, image.width, image.height, image.alpha)
  }
})

test('every fallback ICO frame has transparent corners and an intact center', () => {
  const file = readFileSync('public/favicon.ico')
  assert.equal(file.readUInt16LE(2), 1)
  const sizes: number[] = []
  for (let index = 0; index < file.readUInt16LE(4); index++) {
    const entry = 6 + index * 16, offset = file.readUInt32LE(entry + 12)
    const width = file[entry] || 256, height = file[entry + 1] || 256
    sizes.push(width)
    assert.equal(file.readUInt16LE(offset + 14), 32, 'RGBA ICO frame required')
    const pixels = offset + file.readUInt32LE(offset)
    // Tiny ICO frames may contain partial edge coverage after resampling.
    rounded(`favicon.ico ${width}`, width, height, (x, y) => file[pixels + ((height - 1 - y) * width + x) * 4 + 3] / 255, .2)
  }
  assert.deepEqual(sizes.sort((a, b) => a - b), [16, 32, 48])
})


test('HTML and manifest icon references share a cache version and matching shipped resources', () => {
  const canonical = readFileSync('assets/lingxiloop-logo.svg')
  assert.deepEqual(readFileSync('public/favicon.svg'), canonical)
  assert.match(canonical.toString(), /clipPath[^>]*id="snapshot-frame-clip"[^>]*><rect[^>]*rx="54"/)
  for (const page of ['index.html', 'website/index.html', 'website/privacy.html']) {
    const $ = load(readFileSync(page, 'utf8'))
    const links = $('link').toArray().filter(link => /icon|manifest/.test($(link).attr('rel') ?? ''))
    assert.ok(links.length >= 4, `${page}: missing favicon alternatives`)
    for (const link of links) {
      const href = $(link).attr('href')!
      const url = new URL(href, `https://fixture.invalid/${page}`)
      assert.equal(url.searchParams.get('v'), 'rounded-20261024', `${page}: stale ${href}`)
      assert.ok(readFileSync(url.pathname.startsWith('/website/') ? url.pathname.slice(1) : `public${url.pathname}`).length)
    }
  }
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, 'https://fixture.invalid')
    assert.equal(url.searchParams.get('v'), 'rounded-20261024')
    const image = pngPixels(`public${url.pathname}`)
    assert.equal(icon.sizes, `${image.width}x${image.height}`)
  }
  for (const name of ['favicon-32.png', 'favicon.ico', 'icon-192.png']) assert.deepEqual(readFileSync(`website/assets/${name}`), readFileSync(`public/${name}`))
})
