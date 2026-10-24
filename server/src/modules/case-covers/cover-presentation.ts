import { parseCoverProgram } from '../../../../src/features/cases/cover-vm/program.js'
import { CaseCoverGenerationError } from './cover-validation.js'

/** Legacy result field `html` now carries V2 JSON data. Never serve it as HTML,
 * srcdoc or executable script; only the QuickJS Worker consumes its sources.
 */
export function buildCoverPresentation(input: { kernel: string; figure: string; altText: string }): string {
  try {
    if (input.altText.includes('\0')) throw Error()
    const program = JSON.stringify({ version: 2, engine: 'quickjs-wasm', kernel: input.kernel, figure: input.figure })
    parseCoverProgram(program)
    return program
  } catch { throw new CaseCoverGenerationError('invalid_model_output') }
}
