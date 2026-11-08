// Bounded numeric projection of evidence already collected by the benchmark.
// Keep URLs, resource hashes, commands, source text and arbitrary strings out.
const numeric=(value,keys)=>Object.fromEntries(keys.filter(key=>typeof value?.[key]==='number'&&Number.isFinite(value[key])).map(key=>[key,value[key]]))
const roles=['root','renderer','gpu','utility','other']
function memory(value){
 if(!value||typeof value!=='object')return null
 const observations=Array.isArray(value.observations)?value.observations:[value],roleMeans={}
 for(const role of roles){
  const rows=observations.map(row=>row?.processRoles?.[role]).filter(Boolean)
  if(!rows.length)continue
  const result={}
  for(const key of ['bytes','processes']){
   const values=rows.map(row=>row[key]).filter(value=>typeof value==='number'&&Number.isFinite(value))
   if(values.length)result[key]=values.reduce((sum,value)=>sum+value,0)/values.length
  }
  roleMeans[role]=result
 }
 return{...numeric(value,['bytes','processes','spreadBytes']),observationCount:observations.length,roleMeans}
}
const documentKeys=['mountedPages','mountedNodes','mountedThumbnails','htmlImages','readyHtmlImages','readyImageNaturalPixels','readyVisibleImageNaturalPixels','svgImages','svgDataImages','svgBlobImages','svgLogicalPixels','rootJsHeapBytes']
function documents(value){
 if(!Array.isArray(value))return null
 return{frameCount:value.length,frames:value.slice(0,12).map(row=>numeric(row,documentKeys)),omittedFrames:Math.max(0,value.length-12)}
}
function scripts(value){
 if(!Array.isArray(value))return null
 const groups=new Map();let requestCount=0
 for(const row of value){
  if(row?.category!=='script')continue
  requestCount++
  const sizes=numeric(row,['decodedBytes','transferredBytes']),targetType=['page','iframe','worker','service_worker','shared_worker'].includes(row.targetType)?row.targetType:'other'
  const key=JSON.stringify([sizes.decodedBytes??null,sizes.transferredBytes??null,targetType]),group=groups.get(key)
  if(group)group.requests++
  else groups.set(key,{...sizes,targetType,requests:1})
 }
 const buckets=[...groups.values()].sort((a,b)=>(b.decodedBytes??-1)-(a.decodedBytes??-1)||(b.transferredBytes??-1)-(a.transferredBytes??-1))
 return{requestCount,bucketCount:buckets.length,largestBuckets:buckets.slice(0,24),omittedBuckets:Math.max(0,buckets.length-24)}
}
export function diagnosticBreakdown(safe){
 const samples=Array.isArray(safe?.measurement?.samples)?safe.measurement.samples:[]
 return{sampleCount:samples.length,omittedSamples:Math.max(0,samples.length-8),samples:samples.slice(0,8).map(sample=>({
  ...numeric(sample,['run']),
  ...Object.fromEntries([['arm',['baseline','candidate']],['kind',['design','slides']],['mode',['fullNavigation','workbenchOpen']]].filter(([key,values])=>values.includes(sample[key])).map(([key])=>[key,sample[key]])),
  inputSamplesMs:Array.isArray(sample.inputSamplesMs)?sample.inputSamplesMs.filter(value=>typeof value==='number'&&Number.isFinite(value)).slice(0,16):[],
  memory:{host:memory(sample.hostOnlyPss),firstEditable:memory(sample.firstEditablePss),afterTraversal:memory(sample.afterTraversalPss)},
  documents:{first:documents(sample.firstDocumentState),afterTraversal:documents(sample.afterTraversalDocumentState)},
  scriptsAtEditable:scripts(sample.requestsAtEditable)
 }))}
}
