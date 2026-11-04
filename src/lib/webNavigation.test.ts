import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readWebDestination, safeAuthReturnPath, writeWebDestination } from './webNavigation'

test('case management survives restoration and authentication without leaking into other modules', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  let location = new URL('https://example.test/cases/draft-1?view=cases&company=school&caseView=manage')
  const history = { state: null, replaceState: (_state: unknown, _unused: string, path: string) => { location = new URL(path, location) } }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { get location() { return location }, history } })
  try {
    assert.equal(safeAuthReturnPath(location.searchParams), '/cases/draft-1?view=cases&company=school&caseView=manage')
    writeWebDestination(readWebDestination(), 'replace')
    assert.equal(location.searchParams.get('caseView'), 'manage')
    writeWebDestination({ projectId: null, view: 'conversations', conversationId: null }, 'replace')
    assert.equal(location.searchParams.has('caseView'), false)
    location = new URL('https://example.test/cases?view=cases&caseView=invalid')
    assert.equal(safeAuthReturnPath(location.searchParams), '/cases?view=cases')
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
