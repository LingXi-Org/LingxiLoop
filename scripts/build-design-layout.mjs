import assert from 'node:assert/strict'
import { build } from 'esbuild'

export async function buildDesignLayout() {
  const compile = async (contents, extra = {}) => (await build({ stdin: { contents, resolveDir: process.cwd() },
    bundle: true, format: 'iife', platform: 'browser', target: ['chrome120', 'firefox120', 'safari17'],
    minify: true, write: false, ...extra })).outputFiles[0].text
  const guest = await compile("import {installDesignFlowSize} from './shared/design-flow-size';installDesignFlowSize()")
  const host = await compile("export {resizeFlowManifest} from './shared/design-flow-size'", { globalName: '__lingxiDesignFlow' })
  return { guest, host }
}

/** Exact hooks into the pinned editor's existing checked guest and model owner.
 * Keep source/archive bytes, native edit guards, throttles and CAS persistence. */
export function adaptDesignLayout(source, host) {
  const changes = [
    ['if(Zn&&Zn.type==="contentHull"){', 'if(Zn&&Zn.type==="flowSize"){if(i||c||l||!o||!Number.isFinite(Zn.w)||!Number.isFinite(Zn.h)||Zn.h<40||Zn.h>8000||Math.abs(Zn.w-o.w)>1)return;let bn=(0,e.normalizeArtboardMeasuredSize)(Zn);bn&&v?.(f,{...bn,flow:true});return}if(Zn&&Zn.type==="contentHull"){'],
    ['if(!rt||!rt.frameless)return;', 'if(!rt||(!rt.frameless&&!be.flow))return;'],
    ['if(!yr.current||!st){lv.current.set(ae,be);return}', 'if(!yr.current||(!st&&!be.flow)){lv.current.set(ae,be);return}'],
    ['(yo.current.has(ae)||Ds===ae||yl===ae)&&U0(ae,be)', '(be.flow||yo.current.has(ae)||Ds===ae||yl===ae)&&U0(ae,be)'],
    ['let Dt=kr((0,e.replaceDesignArtboards)(ga.current,ga.current.artboards.map(Pt=>Pt.file===ae?{...Pt,w:be.w,h:be.h}:Pt)));', 'let Dt=kr(be.flow?__lingxiDesignFlow.resizeFlowManifest(ga.current,ae,be,e.moveAnnotation):(0,e.replaceDesignArtboards)(ga.current,ga.current.artboards.map(Pt=>Pt.file===ae?{...Pt,w:be.w,h:be.h}:Pt)));if(Dt===ga.current)return;'],
  ]
  for (const [needle, replacement] of changes) {
    assert.equal(source.split(needle).length, 2, `pinned Design flow hook changed: ${needle}`)
    source = source.replace(needle, () => replacement)
  }
  return host + '\n' + source
}
