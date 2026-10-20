import sdk from '@modelcontextprotocol/ext-apps/app-with-deps?raw'
import editor from './editor.js?raw'

let sdkUrl: string | undefined
export function canvasAppDocument() {
  if (!sdkUrl) {
    const bytes = new TextEncoder().encode(sdk)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
    sdkUrl = `data:text/javascript;base64,${btoa(binary)}`
  }
  const nonce = crypto.randomUUID()
  // All markup and scripts are fixed build inputs. Canvas content arrives only as SDK data.
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<!-- Official MCP Apps 2.0.0 bundle, unmodified. Distribution notices: /licenses/mcp-apps-2.0.0.txt and /licenses/mcp-sdk-1.30.0.txt. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' data:; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{color-scheme:light dark;font:13px system-ui,sans-serif;color:#242424;background:#fff}*{box-sizing:border-box}body{margin:0;padding:10px;display:flex;flex-direction:column;height:100vh;gap:8px}textarea{width:100%;min-height:65px;flex:1;resize:none;border:1px solid #b7b7b7;border-radius:6px;padding:9px;font:inherit;line-height:1.6;color:inherit;background:transparent}button{border:1px solid #aaa;border-radius:5px;padding:5px 9px;background:transparent;color:inherit;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,textarea:focus-visible{outline:2px solid #6d4bd1;outline-offset:2px}.actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}output{font-size:12px;line-height:1.4;min-height:17px}.error{color:#b42318}[hidden]{display:none!important}@media(prefers-color-scheme:dark){:root{color:#eee;background:#242424}.error{color:#ffb4ab}}
</style></head><body><textarea aria-label="编辑文档" disabled spellcheck="true"></textarea><output role="status" aria-live="polite">正在连接编辑器…</output><div class="actions"><button id="save" disabled>保存修改</button><button id="reference" disabled>引用选区</button><button id="reload" hidden>重新载入已保存版本</button></div><script type="module" nonce="${nonce}">
${editor.replace("'@modelcontextprotocol/ext-apps/app-with-deps'", JSON.stringify(sdkUrl)).replace(/<\/script/gi, '<\\/script')}
</script></body></html>`
}
