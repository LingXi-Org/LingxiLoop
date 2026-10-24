import { spawn } from 'node:child_process'
import { access,readFile,mkdtemp,writeFile,copyFile,rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { load } from 'cheerio'
import { withCoverScriptPolicy } from './cover-presentation.js'
import { CaseCoverGenerationError } from './cover-validation.js'

export interface CoverRenderer {
  assertAvailable(signal:AbortSignal):Promise<void>
  render(input:{validatedHtml:string;signal:AbortSignal}):Promise<string>
}
const CHROME = '/usr/lib/chromium/chromium'
const BWRAP = '/usr/bin/bwrap'
/** No environment, application tree, home directory, credentials or network are inherited. */
export function coverSandboxArguments(inputDirectory:string, command:string[]): string[] {
  return ['--unshare-all','--die-with-parent','--new-session','--uid','1000','--gid','1000','--clearenv',
    '--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--symlink','usr/lib64','/lib64',
    '--proc','/proc','--dev','/dev','--tmpfs','/tmp','--tmpfs','/home',
    '--ro-bind',inputDirectory,'/input','--chdir','/input',
    '--setenv','HOME','/tmp','--setenv','LANG','C.UTF-8','--',...command]
}
function boundedProcess(args:string[],signal:AbortSignal,timeout:number):Promise<string> {
  signal.throwIfAborted()
  return new Promise((resolve,reject) => {
    const child = spawn(BWRAP,args,{env:{},stdio:['ignore','pipe','pipe'],detached:true})
    let output = '', overflow = false, settled = false, timedOut = false
    const kill = () => { if(child.pid) { try { process.kill(-child.pid,'SIGKILL') } catch { child.kill('SIGKILL') } } }
    const timer = setTimeout(() => { timedOut=true; kill() },timeout)
    signal.addEventListener('abort',kill,{once:true})
    if (signal.aborted) kill()
    const done = (error?:Error) => {
      if(settled) return; settled=true
      clearTimeout(timer); signal.removeEventListener('abort',kill)
      if(signal.aborted) reject(signal.reason)
      else if(error) reject(error)
      else resolve(output)
    }
    child.stdout.on('data',(chunk:Buffer) => { output+=chunk.toString('utf8'); if(Buffer.byteLength(output)>1_000_000){ overflow=true;kill() } })
    child.stderr.resume() // Never log generated source or arbitrary browser diagnostics.
    child.once('error',() => done(new CaseCoverGenerationError('renderer_unavailable')))
    child.once('close',code => done(code===0&&!overflow&&!timedOut?undefined:new CaseCoverGenerationError('render_failed')))
  })
}
export const isolatedCoverRenderer:CoverRenderer = {
  async assertAvailable(signal) {
    try {
      await Promise.all([access(BWRAP),access(CHROME),access('/usr/bin/python3')])
      // Production has an explicit existing cgroup contract. Never remove limits
      // or fall back to an unsandboxed browser when user namespaces are blocked.
      const [memory,pids] = await Promise.all([readFile('/sys/fs/cgroup/memory.max','utf8'),readFile('/sys/fs/cgroup/pids.max','utf8')])
      if(!/^\d+$/.test(memory.trim()) || Number(memory)>1_073_741_824 || !/^\d+$/.test(pids.trim()) || Number(pids)>128) throw Error()
      const probe = await mkdtemp(join(tmpdir(),'case-cover-probe-'))
      try { await boundedProcess(coverSandboxArguments(probe,['/usr/bin/true']),signal,3_000) }
      finally { await rm(probe,{recursive:true,force:true}) }
    } catch { signal.throwIfAborted(); throw new CaseCoverGenerationError('renderer_unavailable') }
  },
  async render({validatedHtml,signal}) {
    const dir=await mkdtemp(join(tmpdir(),'case-cover-render-'))
    try {
      // Original validated bytes remain separate. This execution wrapper adds
      // policy only; it is never claimed to pass original template equality.
      const html=withCoverScriptPolicy(validatedHtml)
      await writeFile(join(dir,'cover.html'),html,{mode:0o600})
      await copyFile(fileURLToPath(new URL('./render-limits.py',import.meta.url)),join(dir,'render-limits.py'))
      const document=await boundedProcess(coverSandboxArguments(dir,[
        '/usr/bin/python3','/input/render-limits.py',CHROME,'--headless','--disable-gpu','--no-first-run',
        '--no-default-browser-check','--disable-background-networking','--disable-extensions',
        '--disable-dev-shm-usage','--user-data-dir=/tmp/profile','--window-size=640,640',
        '--virtual-time-budget=1500','--run-all-compositor-stages-before-draw','--dump-dom','file:///input/cover.html',
      ]),signal,15_000)
      const $=load(document)
      const svg=$('#stage > svg')
      if(svg.length!==1 || !svg.find('path,circle,rect,ellipse,line,polygon,polyline').length || !$('#error').is('[hidden]')) throw new CaseCoverGenerationError('render_failed')
      return $.html(svg)
    } finally { await rm(dir,{recursive:true,force:true}) }
  },
}
