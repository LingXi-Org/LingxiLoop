import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CaseCoverGenerationError } from './cover-validation.js'

export const HAIRLINE_COMMIT = '37d2e78dcb333ab30c3338e28ed4a690364ea014'
const vendor = new URL('./vendor/', import.meta.url)
export async function readHairlineResources() {
  const manifest = JSON.parse(await readFile(new URL('manifest.json',vendor),'utf8')) as {commit:string;files:Record<string,string>}
  if (manifest.commit !== HAIRLINE_COMMIT) throw new CaseCoverGenerationError('source_integrity')
  const files: Record<string,string> = {}
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (path.includes('..') || path.startsWith('/')) throw new CaseCoverGenerationError('source_integrity')
    const bytes = await readFile(new URL(path,vendor))
    if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new CaseCoverGenerationError('source_integrity')
    files[path] = bytes.toString('utf8')
  }
  const resource = (name: string) => {
    const value = files[`skills/hairline-create/${name}`]
    if (!value) throw new CaseCoverGenerationError('source_integrity')
    return value
  }
  return { kernel:resource('kernel.js'),rules:resource('rules.md'),skill:resource('SKILL.md'),concepts:resource('concepts.md'),
    riffle:resource('examples/riffle.js'),terrain:resource('examples/terrain.js') }
}
/** Executes audited build+validate only; generated code is syntax-checked, never executed in Node. */
export async function assembleAndValidate(figure: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  await readHairlineResources()
  const temp = await mkdtemp(join(tmpdir(),'case-cover-check-'))
  try {
    return await new Promise<string>((resolve,reject) => {
      const child = spawn(process.execPath,[fileURLToPath(new URL('./upstream-runner.mjs',import.meta.url))], {
        cwd:temp, env:{PATH:dirname(process.execPath),TMPDIR:temp},stdio:['pipe','pipe','pipe'],
        signal,timeout:5_000,killSignal:'SIGKILL',
      })
      let output = '', overflow = false
      child.stdout.on('data',(chunk:Buffer) => { output += chunk.toString('utf8'); if (Buffer.byteLength(output)>512_000) { overflow=true; child.kill('SIGKILL') } })
      child.stderr.resume()
      child.on('error',() => reject(new CaseCoverGenerationError('upstream_validation')))
      child.on('close',code => {
        if (signal.aborted) { reject(signal.reason); return }
        try {
          if (code !== 0 || overflow) throw new Error()
          const value = JSON.parse(output) as {html?:unknown;problems?:unknown[]}
          if (value.problems?.length) throw new CaseCoverGenerationError('upstream_validation',value.problems.filter((code):code is string=>typeof code==='string' && /^[a-z]+$/.test(code)))
          if (typeof value.html !== 'string') throw new Error()
          resolve(value.html)
        } catch (error) { reject(error instanceof CaseCoverGenerationError ? error : new CaseCoverGenerationError('upstream_validation')) }
      })
      child.stdin.on('error',()=>{})
      child.stdin.end(JSON.stringify({figure}))
    })
  } finally { await rm(temp,{recursive:true,force:true}) }
}
