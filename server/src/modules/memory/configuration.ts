import type { MemoryOptions } from '@lyyzka/lingxios'
import { env } from '../../env.js'

/** Reuse the existing authorized embedding route; no second credential or client. */
export function memoryEmbeddings(): MemoryOptions['embeddings'] {
  if(process.env.LINGXILOOP_DISABLE_EMBEDDINGS==='1' && env.NODE_ENV==='test') return undefined
  const id=env.OPENAI_EMBEDDING_MODEL,baseUrl=env.OPENAI_BASE_URL
  const known=id==='Qwen/Qwen3-Embedding-8B' && new URL(baseUrl).hostname==='api.siliconflow.cn'
  const integer=(name:string,fallback?:number)=>{
    const value=Number(process.env[name]?.trim() || fallback)
    if(!Number.isSafeInteger(value) || value<1) throw new Error(`${name} requires a positive integer`)
    return value
  }
  const rate=Number(process.env.SILICONFLOW_USD_CNY_RATE?.trim() || (env.NODE_ENV==='production' ? NaN : 7))
  const configuredPrice=process.env.AGENT_OS_EMBEDDING_INPUT_COST_MICROS_PER_MILLION?.trim()
  // Official price checked 2026-10-20: CNY 0.28 / million input tokens.
  const inputCostMicrosPerMillion=configuredPrice ? Number(configuredPrice) : known && rate>0 ? Math.ceil(280000/rate) : NaN
  if(!Number.isSafeInteger(inputCostMicrosPerMillion) || inputCostMicrosPerMillion<0) throw new Error('embedding price configuration is required')
  return {id,apiKey:env.OPENAI_API_KEY,baseUrl,dimensions:integer('AGENT_OS_EMBEDDING_DIMENSIONS',known?1024:undefined),
    indexVersion:process.env.AGENT_OS_EMBEDDING_INDEX_VERSION?.trim() || 'memory-v1',requestTimeoutMs:3000,inputCostMicrosPerMillion}
}
