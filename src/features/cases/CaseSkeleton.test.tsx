import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import { CaseDetailSkeleton, CaseListSkeleton } from './CaseSkeleton'

test('list loading reserves six cards and only reader mode includes the featured section', () => {
  for (const featured of [true, false]) {
    const $ = load(renderToStaticMarkup(<CaseListSkeleton featured={featured} />))
    assert.equal($('.case-featured').length, Number(featured))
    assert.equal($('.case-grid .case-card').length, 6)
    assert.equal($('[role=status][aria-busy=true]').attr('aria-label'), '正在加载教学案例')
    assert.equal($('button,a,input,[tabindex]').length, 0)
    assert.equal($('[data-slot=skeleton]').not('[aria-hidden=true]').length, 0)
  }
})

test('detail loading reserves the reader layout and exposes one loading announcement', () => {
  const $ = load(renderToStaticMarkup(<CaseDetailSkeleton />))
  assert.equal($('[role=status]').length, 1)
  assert.equal($('[role=status][aria-busy=true]').attr('aria-label'), '正在加载案例')
  assert.equal($('.case-reader-heading').length, 1)
  assert.equal($('.case-reading-column .case-reader-cover').length, 1)
  assert.equal($('.case-outline [data-slot=skeleton]').length, 4)
  assert.equal($('button,a,input,[tabindex]').length, 0)
})
