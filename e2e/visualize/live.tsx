import {useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {AssistantRuntimeProvider,MessagePrimitive,ThreadPrimitive,useExternalStoreRuntime} from '@assistant-ui/react'
import '@fontsource-variable/inter'
import '@fontsource-variable/geist'
import '@/styles/globals.css'
import {NativeMessageContent} from '@/features/chat/components/NativeMessageContent'
import {deserializeMessage,type NativeMessage} from '@/lib/nativeMessage'
import {useAuth} from '@/stores/auth'
import {setWorkspaceSession} from '@/lib/workspaceSession'

type Manifest={companyId:string;projectId:string;channelId:string;path:string;sourceMessageId:string}
const manifest:Manifest=await fetch('/__visualize_live/manifest').then(response=>response.json())
useAuth.setState({activeCompanyId:manifest.companyId,ready:true})
setWorkspaceSession({companyId:manifest.companyId,projectId:manifest.projectId})
function Message(){return <MessagePrimitive.Root><NativeMessageContent/></MessagePrimitive.Root>}
function Live(){
  const [messages,setMessages]=useState<ReturnType<typeof deserializeMessage>[]>([])
  const [error,setError]=useState('')
  useEffect(()=>{
    async function refresh(){
      const response=await fetch(`/api/im/channels/${encodeURIComponent(manifest.channelId)}/messages?limit=100`,{headers:{'x-company-id':manifest.companyId,'x-project-id':manifest.projectId},credentials:'include'})
      if(!response.ok)throw new Error(`Live history rejected (${response.status})`)
      const history:Array<{payload:NativeMessage}>=await response.json()
      setMessages(history.map(item=>deserializeMessage(item.payload)))
    }
    void refresh().catch(reason=>setError(String(reason)))
    const timer=setInterval(()=>void refresh().catch(reason=>setError(String(reason))),500)
    return()=>clearInterval(timer)
  },[])
  const runtime=useExternalStoreRuntime({messages,isRunning:false,onNew:async()=>{}})
  return <main className="mx-auto max-w-3xl p-6" data-testid="live-product-messages"><h1>真实模型交互讲解</h1>{error&&<p role="alert">{error}</p>}<AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Messages components={{Message}}/></ThreadPrimitive.Root></AssistantRuntimeProvider></main>
}
createRoot(document.getElementById('root')!).render(<Live/> )
