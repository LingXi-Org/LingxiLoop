import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'

export const FIXTURE_VERSION = 1
export const FIXTURE_PAGE_COUNT = 50
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const formulas = [String.raw`E=mc^2`, String.raw`\frac{1}{2}+\sum_{i=1}^{n}i`, String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`, String.raw`\int_0^1 x^2\,dx=\frac{1}{3}`]
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

// Deterministic, distinct real raster images. No remote assets or shared-image shortcut.
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, bytes) {
  const name = Buffer.from(type), header = Buffer.alloc(4), tail = Buffer.alloc(4)
  header.writeUInt32BE(bytes.length); tail.writeUInt32BE(crc32(Buffer.concat([name, bytes])))
  return Buffer.concat([header, name, bytes, tail])
}
export function fixtureImage(index) {
  const width = 640, height = 360, stride = 1 + width * 3, pixels = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = y * stride + 1 + x * 3, stripe = ((x + y + index * 11) % 37) < 5 ? 48 : 0
    pixels[at] = (x + index * 7 + stripe) % 256
    pixels[at + 1] = (y + index * 13) % 256
    pixels[at + 2] = (Math.floor(x / 4) + Math.floor(y / 3) + index * 17) % 256
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

export function createFixture(kind, id = `benchmark-${kind}`, imageUrls) {
  if (!['design', 'slides'].includes(kind)) throw Error('fixture kind must be design or slides')
  const images = Array.from({ length: FIXTURE_PAGE_COUNT }, (_, index) => {
    const bytes = fixtureImage(index)
    return { id: `image-${index + 1}`, filename: `image-${index + 1}.png`, bytes, sha256: sha256(bytes), contentType: 'image/png', width: 640, height: 360 }
  })
  const document = { schemaVersion: 1, id, kind, title: `50 ${kind === 'slides' ? '页' : '画板'}图片公式验收`, seq: 0, themeId: 'fixture-theme',
    themes: { 'fixture-theme': { id: 'fixture-theme', name: '验收主题', tokens: { background: '#faf8f4', text: '#18332b', accent: '#426b46', fontFamily: 'Arial' } } }, assets: {}, pageOrder: [], pages: {}, versions: {} }
  const legacyFiles = new Map()
  const boards = {}, boardOrder = []
  for (let index = 0; index < FIXTURE_PAGE_COUNT; index++) {
    const number = index + 1, pageId = `page-${number}`, title = `验收页面 ${number}`, image = images[index]
    const url = imageUrls?.[index] ?? `/native-artifact-fixture/${image.filename}`
    document.assets[image.id] = { id: image.id, url, contentType: image.contentType, sha256: image.sha256, width: image.width, height: image.height }
    const makeNode = (type, name, x, y, width, height, extra) => ({ id: `${pageId}-${name}`, type, x, y, width, height, rotation: 0, parentId: null, style: {}, ...extra })
    const nodes = [
      makeNode('text', 'heading', 64, 40, 1152, 76, { text: title, style: { fontSize: 48, fontWeight: 700, color: '#18332b', fontFamily: 'Arial' } }),
      makeNode('text', 'body', 64, 126, 1152, 48, { text: `第 ${number} 页固定样稿 · Human and Agent edit the same document.`, style: { fontSize: 24, color: '#18332b', fontFamily: 'Arial' } }),
      makeNode('image', 'image', 64, 200, 640, 360, { assetId: image.id }),
      makeNode('math', 'formula', 744, 220, 460, 160, { source: formulas[index % formulas.length], style: { fontSize: 32, color: '#18332b' } }),
      makeNode('shape', 'shape', 760, 440, 180, 80, { shape: 'rect', style: { fill: '#426b46', borderRadius: 12 } }),
      makeNode('table', 'table', 64, 600, 1152, 70, { cells: [['页面 Page', '图像 Image', '公式 Formula'], [String(number), image.filename, `formula-${index % formulas.length + 1}`]], style: { fontSize: 18, color: '#18332b' } }),
    ]
    const page = { id: pageId, title, x: kind === 'design' ? (index % 5) * 2080 : 0, y: kind === 'design' ? Math.floor(index / 5) * 1240 : 0, width: 1920, height: 1080,
      background: '#faf8f4', notes: `第 ${number} 页讲者备注，保存和导出后必须保留。`, skip: false, transition: 'none', nodeOrder: nodes.map(node => node.id), nodes: Object.fromEntries(nodes.map(node => [node.id, node])) }
    document.pageOrder.push(pageId); document.pages[pageId] = page
    const body = `<h1 style="position:absolute;left:64px;top:40px;margin:0;font-size:48px;font-weight:700">${title}</h1><p style="position:absolute;left:64px;top:126px;margin:0;font-size:24px">${escape(nodes[1].text)}</p><img src="${escape(url)}" alt="验收图片 ${number}" style="position:absolute;left:64px;top:200px;width:640px;height:360px"><p style="position:absolute;left:744px;top:220px;width:460px;font-size:32px">\\[${escape(nodes[3].source)}\\]</p><div style="position:absolute;left:760px;top:440px;width:180px;height:80px;border-radius:12px;background:#426b46"></div><table style="position:absolute;left:64px;top:600px;width:1152px;font-size:18px"><tr><td>页面 Page</td><td>图像 Image</td><td>公式 Formula</td></tr><tr><td>${number}</td><td>${image.filename}</td><td>formula-${index % formulas.length + 1}</td></tr></table>`
    if (kind === 'slides') legacyFiles.set(`project/slides/${pageId}.html`, Buffer.from(`<section id="${pageId}" style="position:relative;width:1920px;height:1080px;background:#faf8f4;color:#18332b;font-family:Arial">${body}<aside>${page.notes}</aside></section>`))
    else {
      const filename = `Page${number}.dc.html`
      boards[filename] = { x: page.x, y: page.y, w: page.width, h: page.height }; boardOrder.push(filename)
      legacyFiles.set(`project/${filename}`, Buffer.from(`<html><head><script src="./support.js"></script></head><body><x-dc><div style="position:relative;width:1920px;height:1080px;background:#faf8f4;color:#18332b;font-family:Arial">${body}</div></x-dc></body></html>`))
    }
  }
  if (kind === 'slides') legacyFiles.set('project/deck.json', Buffer.from(JSON.stringify({ v: 4, lists: 'css', title: document.title, order: document.pageOrder, sections: {}, faces: {}, designSystems: [] })))
  else legacyFiles.set('project/canvas.json', Buffer.from(JSON.stringify({ v: 3, title: document.title, launch: { view: 'canvas' }, pages: [], boards, order: boardOrder, notes: {}, designSystems: [] })))
  return { document, legacyFiles, images, manifest: { version: FIXTURE_VERSION, pages: FIXTURE_PAGE_COUNT, images: images.length, formulas: FIXTURE_PAGE_COUNT,
    imageBytes: images.reduce((sum, image) => sum + image.bytes.length, 0), imageHashes: images.map(({ filename, sha256, bytes }) => ({ filename, sha256, bytes: bytes.length })),
    semanticSha256: sha256(JSON.stringify({ kind, titles: document.pageOrder.map(key => document.pages[key].title), formulas, images: images.map(image => image.sha256) })),
    nativeSha256: sha256(JSON.stringify(document)), legacyFiles: [...legacyFiles].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) })) } }
}
