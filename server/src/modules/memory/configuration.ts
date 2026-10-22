import type { MemoryOptions } from '@lyyzka/lingxios'
import { env } from '../../env.js'
import { siliconFlowPricingForModel } from '../../agent-runtime/pricing.js'

/** Reuse the existing authorized embedding route; no second credential or client. */
export function memoryEmbeddings(): MemoryOptions['embeddings'] {
  if(process.env.LINGXILOOP_DISABLE_EMBEDDINGS==='1' && env.NODE_ENV==='test') return undefined
  const id=env.OPENAI_EMBEDDING_MODEL,baseUrl=env.OPENAI_BASE_URL
  const siliconflow=new URL(baseUrl).hostname==='api.siliconflow.cn'
  const bge=siliconflow && (id==='BAAI/bge-m3' || id==='Pro/BAAI/bge-m3')
  const known=siliconflow && (bge || id==='Qwen/Qwen3-Embedding-8B')
  const integer=(name:string,fallback?:number)=>{
    const value=Number(process.env[name]?.trim() || fallback)
    if(!Number.isSafeInteger(value) || value<1) throw new Error(`${name} requires a positive integer`)
    return value
  }
  const configuredPrice=process.env.AGENT_OS_EMBEDDING_INPUT_COST_MICROS_PER_MILLION?.trim()
  const pricing=known ? siliconFlowPricingForModel(baseUrl,id,env.NODE_ENV==='production') : undefined
  // Pro BGE input CNY 0.000070/K = CNY 0.07/M; legacy ordinary BGE remains free.
  const inputCostMicrosPerMillion=configuredPrice ? Number(configuredPrice) : pricing ? Math.ceil(pricing.inputPerMillion*1_000_000/pricing.usdCny) : NaN
  if(!Number.isSafeInteger(inputCostMicrosPerMillion) || inputCostMicrosPerMillion<0) throw new Error('embedding price configuration is required')
  const dimensions=integer('AGENT_OS_EMBEDDING_DIMENSIONS',known?1024:undefined)
  return {id,apiKey:env.OPENAI_API_KEY,baseUrl,...(bge?{expectedDimensions:dimensions}:{dimensions}),
    indexVersion:process.env.AGENT_OS_EMBEDDING_INDEX_VERSION?.trim() || 'memory-v1',requestTimeoutMs:3000,inputCostMicrosPerMillion}
}
