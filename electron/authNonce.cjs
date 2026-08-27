/* eslint-env node */

function createAuthNonceGuard({ randomBytes, timingSafeEqual, now = Date.now, ttlMs }) {
  let armedNonce = null
  let armedExpiry = 0

  return {
    arm() {
      armedNonce = randomBytes(16).toString('hex')
      armedExpiry = now() + ttlMs
      return armedNonce
    },
    consume(nonce) {
      if (!armedNonce) return false
      if (now() > armedExpiry) {
        armedNonce = null
        armedExpiry = 0
        return false
      }
      if (typeof nonce !== 'string' || nonce.length !== armedNonce.length) return false
      let matches = false
      try {
        matches = timingSafeEqual(Buffer.from(nonce), Buffer.from(armedNonce))
      } catch {
        return false
      }
      if (!matches) return false
      armedNonce = null
      armedExpiry = 0
      return true
    },
  }
}

module.exports = { createAuthNonceGuard }
