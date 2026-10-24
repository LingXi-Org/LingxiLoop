import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import * as React from 'react'
import * as AssistantUI from '@assistant-ui/react'
import { create } from 'zustand'
import { parseMarkdownIntoBlocks } from 'streamdown'
import { TextOffsetContext } from '@/features/chat/visualize/TextOffsetContext'
import type { MarkdownConfidenceClaim } from './markdown-text'
import type { Participant } from '@/types'

type CitationValue = {
  offsets: number[]; claims: readonly MarkdownConfidenceClaim[]; inlineCitations: boolean
  mentionTargets: readonly Participant[]; agent: boolean; animate: boolean
}

test('plain body appends keep the citation provider identity while citation inputs still invalidate it', async context => {
  const memos: { dependencies: React.DependencyList | undefined; value: unknown }[] = []
  const states: unknown[] = []
  let memoIndex = 0, stateIndex = 0, reducedMotion = false, splitOffset: number | null = null
  let text = '已完成段落。\n\n'.repeat(16) + '正在继续'
  let leadingText = ''
  const messagePart = () => ({ type: 'text', text, status: { type: 'running' } })
  const state = () => {
    const part = messagePart()
    return { part, message: { id: 'synthetic-reply', status: { type: 'running' },
      parts: leadingText ? [{ type: 'text', text: leadingText }, { type: 'data', name: 'separator', data: {} }, part] : [part] } }
  }
  // Run the actual component body with persistent hook slots. This observes its
  // memoized Provider value; it does not count browser renders or notifications.
  mock.module('react', { namedExports: { ...React,
    useMemo: <T,>(compute: () => T, dependencies: React.DependencyList | undefined) => {
      const index = memoIndex++, previous = memos[index]
      if (previous && dependencies && previous.dependencies?.length === dependencies.length
        && dependencies.every((value, position) => Object.is(value, previous.dependencies![position]))) return previous.value as T
      const value = compute()
      memos[index] = { dependencies, value }
      return value
    },
    useState: <T,>(initial: T | (() => T)) => {
      const index = stateIndex++
      if (!(index in states)) states[index] = typeof initial === 'function' ? (initial as () => T)() : initial
      return [states[index] as T, (value: React.SetStateAction<T>) => {
        states[index] = typeof value === 'function' ? (value as (previous: T) => T)(states[index] as T) : value
      }]
    },
    useContext: (value: React.Context<unknown>) => {
      assert.equal(value, TextOffsetContext)
      return splitOffset
    },
    useSyncExternalStore: () => reducedMotion,
  } })
  mock.module('@assistant-ui/react', { namedExports: {
    ...AssistantUI,
    useMessagePartText: messagePart,
    useAuiState: (select: (value: ReturnType<typeof state>) => unknown) => select(state()),
  } })
  mock.module('@/stores/auth', { namedExports: { useAuth: create(() => ({ user: null })) } })
  const { MarkdownText } = await import('./markdown-text')
  type Props = React.ComponentProps<typeof MarkdownText>
  const component = (MarkdownText as React.MemoExoticComponent<(props: Props) => React.ReactElement>).type
  function render(props: Props = { agent: true, inlineCitations: true }) {
    memoIndex = stateIndex = 0
    const root = component(props) as React.ReactElement<{ children: React.ReactElement<{ children: React.ReactElement<{ value: CitationValue }> }> }>
    return root.props.children.props.children.props.value
  }
  const first = render()
  let previous = first, changes = 0
  for (let append = 0; append < 20; append++) {
    text += '追加正文'
    const current = render()
    if (!Object.is(previous, current)) changes++
    previous = current
  }
  context.diagnostic(`20 plain body appends: CitationBlocks Provider identity changes=${changes}`)
  assert.equal(changes, 0, 'plain body appends must not invalidate every completed block context consumer')
  assert.equal(previous.offsets, first.offsets)
  leadingText = '前一个正文'
  splitOffset = 31
  assert.equal(render(), first, 'an unused citation offset must not allocate a new empty value')

  text = '第一段 [事实](#cite-S1)\n\n第二段 [事实](#cite-S1)'
  const cited = render()
  assert.notEqual(cited, first)
  const blocks = parseMarkdownIntoBlocks(text)
  let offset = splitOffset
  const expectedOffsets = blocks.map(block => { const start = offset; offset += block.length; return start })
  assert.deepEqual(cited.offsets, expectedOffsets)
  splitOffset = null
  const native = render()
  assert.deepEqual(native.offsets, expectedOffsets.map(value => value - 31 + leadingText.length + 1))
  assert.notEqual(native, cited)
  text += '\n\n第三段 [事实](#cite-S1)'
  const appendedCitation = render()
  assert.notEqual(appendedCitation, native)
  assert.deepEqual(appendedCitation.offsets.slice(0, native.offsets.length), native.offsets)
  assert.ok(appendedCitation.offsets.length > native.offsets.length)
  const claim: MarkdownConfidenceClaim = { id: 'claim', text: '事实', confidence: 'grounded', basis: '合成来源', markers: ['S1'], start: 0, end: 1 }
  const claims = [claim], targets: Participant[] = []
  const withClaims = render({ agent: true, inlineCitations: true, confidenceClaims: claims })
  assert.notEqual(withClaims, native)
  assert.equal(withClaims.claims, claims)
  const withTargets = render({ agent: true, inlineCitations: true, confidenceClaims: claims, mentionTargets: targets })
  assert.notEqual(withTargets, withClaims)
  assert.equal(withTargets.mentionTargets, targets)
  const withoutInline = render({ agent: true, confidenceClaims: claims, mentionTargets: targets })
  assert.notEqual(withoutInline, withTargets)
  assert.equal(withoutInline.inlineCitations, false)
  const user = render({ confidenceClaims: claims, mentionTargets: targets })
  assert.notEqual(user, withoutInline)
  assert.equal(user.agent, false)
  reducedMotion = true
  const staticText = render({ confidenceClaims: claims, mentionTargets: targets })
  assert.notEqual(staticText, user)
  assert.equal(staticText.animate, false)
  text = '移除引用后的正文'
  const plainAgain = render()
  assert.equal(plainAgain.offsets, first.offsets)
  text += '继续追加'
  assert.equal(render(), plainAgain)
})
