import {useEffect,useRef,useState} from 'react'
import type {PenGeometry,PenPoint} from '../../../../shared/artifact-pen'
import type {NativeCompute} from './compute'

interface Input {points:PenPoint[]|null;scale:number;revision:number;compute:NativeCompute}
interface Preview {points:PenPoint[];scale:number;geometry:PenGeometry|null}
/** One in-flight fit and one latest input; pointer events never queue worker fits. */
export function usePenPreview(points:PenPoint[]|null,scale:number,revision:number,compute:NativeCompute,onError:(message:string)=>void){
  const latest=useRef<Input>({points,scale,revision,compute}),busy=useRef(false),controller=useRef<AbortController|null>(null),[preview,setPreview]=useState<Preview|null>(null)
  if(latest.current.points!==points||latest.current.scale!==scale||latest.current.revision!==revision||latest.current.compute!==compute)latest.current={points,scale,revision,compute}
  useEffect(()=>{
    if(!points){controller.current?.abort();setPreview(null);return}
    if(busy.current)return
    busy.current=true
    void(async()=>{
      try{
        while(latest.current.points){
          const input=latest.current,signal=new AbortController();controller.current=signal
          try{const geometry=await input.compute.pen(input.points!,1.25/input.scale,input.revision,signal.signal);if(latest.current===input)setPreview({points:input.points!,scale:input.scale,geometry})}
          catch(error){if((error as Error).name!=='AbortError')onError('绘图预览尚未更新，可继续绘图，松开后将保存曲线。')}
          if(latest.current===input)break
        }
      }finally{busy.current=false;controller.current=null}
    })()
  },[points,scale,revision,compute,onError])
  useEffect(()=>()=>{if(latest.current.compute===compute)latest.current={...latest.current,points:null};controller.current?.abort()},[compute])
  return preview
}
