import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { EDITOR_FONTS, editorFontFamily, editorFontChoice, editorFontKey, editorFontVariants, editorFontFacePatch } from './editor-fonts'

test('all source font choices have Chinese UI names while authored family values remain portable', () => {
  assert.equal(EDITOR_FONTS.length, 29)
  assert.ok(EDITOR_FONTS.every(font => /[\u4e00-\u9fff]/.test(font.label) && !/[A-Za-z]/.test(font.label)))
  assert.equal(new Set(EDITOR_FONTS.map(font => font.value)).size, 29)
  assert.equal(editorFontChoice('Arial')?.label, '阿里亚尔体')
  assert.equal(editorFontChoice('Arial', 'font.sans')?.value, 'role:sans')
  assert.equal(editorFontChoice('"User Font", sans-serif'), undefined)
  assert.equal(editorFontFamily('"User Font", sans-serif'), '"User Font", sans-serif')
  assert.equal(editorFontFamily('Merriweather, serif'), '"LingxiLoopEditor Merriweather", serif')
  assert.equal(editorFontFamily('Merriweather'), '"LingxiLoopEditor Merriweather", serif')
  assert.equal(editorFontFamily('Inter'), '"LingxiLoopEditor Inter", sans-serif')
  assert.equal(editorFontKey('"LingxiLoopEditor Merriweather"'), 'merriweather')
})

test('font faces expose only supported weights and slopes, with atomic family fallback', () => {
  assert.deepEqual(editorFontVariants('Arial').map(face => [face.weight, face.style]), [[400, 'normal'], [400, 'italic'], [700, 'normal'], [700, 'italic']])
  assert.equal(editorFontVariants('Merriweather').length, 14)
  assert.deepEqual(editorFontVariants('Bebas Neue'), [{ weight: 400, style: 'normal', label: '常规' }])
  assert.ok(editorFontVariants('Caveat').every(face => face.style === 'normal'))
  assert.ok(editorFontVariants('Nunito').some(face => face.weight === 1000))
  assert.deepEqual(editorFontFacePatch('Merriweather', { fontWeight: 700, fontStyle: 'italic' }), {})
  assert.deepEqual(editorFontFacePatch('Merriweather', { fontWeight: 450 }), {})
  assert.deepEqual(editorFontFacePatch('Bebas Neue', { fontWeight: 700, fontStyle: 'italic' }), { fontWeight: 400, fontStyle: 'normal' })
})

test('every self-hosted font face has exact bytes and its original open font license', () => {
  const root = new URL('../../../../', import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL('third_party/editor-fonts/manifest.json', root), 'utf8'))
  const css = readFileSync(new URL('src/features/artifacts/native/editor-fonts.css', root), 'utf8')
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
  assert.equal(manifest.fonts.length, 17)
  const retained = new Set<string>()
  for (const font of manifest.fonts) {
    const license = readFileSync(new URL(font.licenseFile, root))
    assert.equal(digest(license), font.licenseSha256)
    assert.match(license.toString(), /SIL OPEN FONT LICENSE|SIL Open Font License/)
    for (const [name, asset] of Object.entries(font.assets) as [string, { sha256: string; bytes: number }][]) {
      const bytes = readFileSync(new URL(`public/fonts/editors/${name}`, root))
      assert.equal(digest(bytes), asset.sha256)
      assert.equal(bytes.byteLength, asset.bytes)
      retained.add(`/fonts/editors/${name}`)
    }
  }
  const references = [...css.matchAll(/url\('([^']+)'\)/g)].map(match => match[1]!)
  assert.deepEqual(new Set(references), retained)
  assert.doesNotMatch(css, /https?:|font-family:\s*'(?!LingxiLoopEditor )/)
})
