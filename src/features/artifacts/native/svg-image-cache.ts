// Completed images only. Visible consumers keep their own displayed image.
const images=new Map<string,{url:string;bytes:number}>()
const listeners=new Map<string,Set<(url:string)=>void>>()
const MAX_ENTRIES=8,MAX_BYTES=4*1024*1024
let retainedBytes=0
export function cachedSvgImage(key:string):string|undefined {
  const value=images.get(key)
  if(!value)return undefined
  images.delete(key);images.set(key,value)
  return value.url
}
export function rememberSvgImage(key:string,url:string):void {
  const previous=images.get(key)
  if(previous){retainedBytes-=previous.bytes;images.delete(key)}
  const bytes=2*(key.length+url.length)
  if(bytes<=MAX_BYTES){
    while(images.size>=MAX_ENTRIES||retainedBytes+bytes>MAX_BYTES){const first=images.keys().next().value!;retainedBytes-=images.get(first)!.bytes;images.delete(first)}
    images.set(key,{url,bytes});retainedBytes+=bytes
  }
  for(const listener of listeners.get(key)??[])listener(url)
}
export function observeSvgImage(key:string,listener:(url:string)=>void):()=>void {
  const group=listeners.get(key)??new Set();group.add(listener);listeners.set(key,group)
  return()=>{group.delete(listener);if(!group.size&&listeners.get(key)===group)listeners.delete(key)}
}
