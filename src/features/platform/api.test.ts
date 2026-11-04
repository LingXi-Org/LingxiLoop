import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mock, test } from 'node:test'
import { UploadFailure } from '../../lib/uploadError'
import { userFacingError } from '../../lib/userFacingError'

test('lost upload acknowledgements reuse one checksum-bound identity and scope changes cannot attach old work', async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {}, removeItem() {} } })
  const { useAuth } = await import('../../stores/auth')
  const requests: { idempotencyKey: string; sha256: string; mime: string }[] = []
  const puts: string[] = []
  let fail = true, signingLoss = true, release: (() => void) | undefined, started: (() => void) | undefined
  class ApiError extends Error { status = 403 }
  mock.module('../../api/core/http.ts', { namedExports: { ApiError, http: async (path: string, init: RequestInit) => {
    if (path.endsWith('/capabilities')) return { maxBytes: 10000, allowedMimes: ['text/plain', 'image/png'] }
    const value = JSON.parse(String(init.body)); requests.push(value)
    if (value.name === 'lost-sign.py' && signingLoss) { signingLoss = false; throw new Error('lost signing response PRIVATE') }
    if (value.name === 'held.png') { started?.(); await new Promise<void>(resolve => { release = resolve }) }
    return { ...value, key: `attachments/company/${value.idempotencyKey}`, publicUrl: '/api/files?key=fixture', uploadUrl: `https://storage.invalid/${value.idempotencyKey}`, kind: value.mime === 'image/png' ? 'img' : 'file' }
  } } })
  mock.module('../../api/transport.ts', { namedExports: { putPresignedFile: async (url: string) => {
    puts.push(url)
    if (fail) { fail = false; throw new Error('lost acknowledgement with PRIVATE URL') }
    return new Response(null, { status: 200 })
  } } })
  useAuth.setState({ user: { id: 'student' } as never, activeCompanyId: 'company', authorizationEpoch: 1 })
  const { uploadsApi } = await import('./api')
  try {
    const file = new File(['print(1)'], 'answer.py', { type: 'text/x-python' })
    await assert.rejects(uploadsApi.uploadFile(file), error => error instanceof UploadFailure && /上传连接中断/.test(userFacingError(error)))
    const uploaded = await uploadsApi.uploadFile(file)
    assert.equal(requests[0].mime, 'text/plain')
    assert.equal(requests[0].sha256, createHash('sha256').update('print(1)').digest('hex'))
    assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey)
    assert.equal(puts[0], puts[1])
    assert.equal(await uploadsApi.uploadFile(file), uploaded)
    assert.equal(puts.length, 2)
    useAuth.setState({ authorizationEpoch: 2 })
    await uploadsApi.uploadFile(file)
    assert.notEqual(requests[1].idempotencyKey, requests[2].idempotencyKey)
    const ready = new Promise<void>(resolve => { started = resolve })
    const pending = uploadsApi.uploadFile(new File(['png'], 'held.png', { type: 'image/png' }))
    await ready
    const before = puts.length
    useAuth.setState({ authorizationEpoch: 3 })
    release!()
    await assert.rejects(pending, error => error instanceof UploadFailure && error.code === 'identity_changed')
    assert.equal(puts.length, before)
    const signedBefore = requests.length
    await assert.rejects(uploadsApi.uploadFile(new File(['bad'], 'program.exe')), error => error instanceof UploadFailure && error.code === 'file_type')
    assert.equal(requests.length, signedBefore)
    const signingFile = new File(['print(2)'], 'lost-sign.py')
    await assert.rejects(uploadsApi.uploadFile(signingFile), error => error instanceof UploadFailure && error.code === 'upload_signing')
    await uploadsApi.uploadFile(signingFile)
    assert.equal(requests.at(-2)!.idempotencyKey, requests.at(-1)!.idempotencyKey)
    assert.equal(requests.at(-2)!.sha256, requests.at(-1)!.sha256)
  } finally { mock.restoreAll() }
})
