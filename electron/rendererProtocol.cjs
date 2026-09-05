/* eslint-env node */
const path = require('node:path')

function registerRendererScheme(protocol) {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
}

function rendererFile(reqUrl, distRoot) {
  const url = new URL(reqUrl)
  if (url.hostname !== 'lingxiloop') return null
  let relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  if (!relativePath || relativePath === 'index.html') relativePath = 'index.html'
  const resolved = path.normalize(path.join(distRoot, relativePath))
  const relative = path.relative(distRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return resolved
}

module.exports = { registerRendererScheme, rendererFile }
