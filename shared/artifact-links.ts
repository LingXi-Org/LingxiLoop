/** Private editor destinations use stable IDs; grants and document data never enter links. */
const identity=/^[A-Za-z0-9_-]{1,128}$/

/** Relative document destinations remain data; executable URL schemes do not. */
export function isSafeArtifactLink(value:string):boolean {
  if(!value||/[\u0000-\u0020<>]/.test(value))return false
  // Retain the legacy mark contract; a draft may still contain only https://.
  if(/^(?:https?:\/\/|mailto:|#)/i.test(value))return true
  if(value.startsWith('//')||/[\u007f\\]/.test(value))return false
  try{return ['http:','https:','mailto:','tel:'].includes(new URL(value,'https://artifact.invalid/').protocol)}catch{return false}
}
export interface DesignLink {artifactId:string;canvasPageId?:string}
export function readDesignLink(parameters:URLSearchParams):DesignLink|null {
  const artifactId=parameters.get('design'),canvasPageId=parameters.get('canvasPage')
  if(!artifactId||!identity.test(artifactId)||canvasPageId!==null&&!identity.test(canvasPageId))return null
  return{artifactId,...(canvasPageId?{canvasPageId}:{})}
}
export function copyDesignLinkParameters(source:URLSearchParams,target:URLSearchParams){
  if(source.get('view')!=='conversations'||target.get('view')!=='conversations'||source.get('project')!==target.get('project')||source.get('conversation')!==target.get('conversation'))return
  const link=readDesignLink(source)
  if(link){target.set('design',link.artifactId);if(link.canvasPageId)target.set('canvasPage',link.canvasPageId)}
}
export function designPageLink(current:URL,artifactId:string,canvasPageId:string):string {
  if(!identity.test(artifactId)||!identity.test(canvasPageId))throw new Error('页面标识无效，请重新打开后重试。')
  const project=current.searchParams.get('project'),conversation=current.searchParams.get('conversation')
  if(current.searchParams.get('view')!=='conversations'||!project||!conversation)throw new Error('请从所属会话打开设计后复制页面链接。')
  const url=new URL('/',current.origin)
  for(const [key,value]of Object.entries({project,view:'conversations',conversation,design:artifactId,canvasPage:canvasPageId}))url.searchParams.set(key,value)
  return url.href
}
