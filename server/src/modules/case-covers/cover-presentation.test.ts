import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { load } from 'cheerio'
import { buildCoverPresentation } from './cover-presentation.js'
import { CaseCoverGenerationError } from './cover-validation.js'

for (const [name,newline] of [['LF','\n'],['CRLF','\r\n'],['CR','\r']]) {
  test(`presentation script hashes match HTML-parsed text with ${name} input`,()=>{
    const html=buildCoverPresentation({kernel:`var HL = {};${newline}`,figure:`const n = 1;${newline}hairline({});`,altText:'封面'})
    const $=load(html)
    const policy=$('meta[http-equiv="Content-Security-Policy"]').attr('content')!
    $('script').each((_,script)=>{
      const hash=createHash('sha256').update($(script).text()).digest('base64')
      assert.ok(policy.includes(`'sha256-${hash}'`),'HTML parser normalization must not invalidate the script allowlist')
    })
    assert.doesNotMatch(policy,/script-src[^;]*'unsafe-inline'|'unsafe-eval'/)
    assert.doesNotMatch(html,/\r/)
  })
}
test('presentation rejects NUL rather than hashing bytes the HTML parser replaces',()=>{
  for(const field of ['figure','kernel','altText'] as const) {
    const input={kernel:'var HL = {};',figure:'hairline({});',altText:'封面'}
    input[field]+='\u0000'
    assert.throws(()=>buildCoverPresentation(input),CaseCoverGenerationError)
  }
})
