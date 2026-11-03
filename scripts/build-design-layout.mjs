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
    // ArtboardFrame props in this pin: frameless l, expanded d, playing i, box r, onContentHull v, file f.
    ['if(Sr&&Sr.type==="contentHull"){', 'if(Sr&&Sr.type==="flowSize"){if(l||d||i||!r||!Number.isFinite(Sr.w)||!Number.isFinite(Sr.h)||Sr.h<40||Sr.h>8000||Math.abs(Sr.w-r.w)>1)return;let Cn=(0,e.normalizeArtboardMeasuredSize)(Sr);Cn&&v?.(f,{...Cn,flow:true});return}if(Sr&&Sr.type==="contentHull"){'],
    ['if(!at||!at.frameless)return;', 'if(!at||(!at.frameless&&!xe.flow))return;'],
    ['if(!Vl.current||!ft){Id.current.set(ae,xe);return}', 'if(!Vl.current||(!ft&&!xe.flow)){Id.current.set(ae,xe);return}'],
    ['(Ur.current.has(ae)||Zs===ae||jl===ae)&&ym(ae,xe)', '(xe.flow||Ur.current.has(ae)||Zs===ae||jl===ae)&&ym(ae,xe)'],
    ['let Lt=No((0,e.replaceDesignArtboards)(Ka.current,Ka.current.artboards.map(It=>It.file===ae?{...It,w:xe.w,h:xe.h}:It)));', 'let Lt=No(xe.flow?__lingxiDesignFlow.resizeFlowManifest(Ka.current,ae,xe,e.moveAnnotation):(0,e.replaceDesignArtboards)(Ka.current,Ka.current.artboards.map(It=>It.file===ae?{...It,w:xe.w,h:xe.h}:It)));if(Lt===Ka.current)return;'],
  ]
  for (const [needle, replacement] of changes) {
    assert.equal(source.split(needle).length, 2, `pinned Design flow hook changed: ${needle}`)
    source = source.replace(needle, () => replacement)
  }
  return host + '\n' + source
}
