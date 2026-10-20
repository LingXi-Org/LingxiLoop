// Synthetic completed tool result; the real product card uses real isolated HTTP/PG.
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { NativeMessageContent } from '@/features/chat/components/NativeMessageContent'
import { createNativeMessage, deserializeMessage } from '@/lib/nativeMessage'
import { AppThemeProvider } from '@/components/AppThemeProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuth } from '@/stores/auth'
import '@/styles/globals.css'
if (!import.meta.env.DEV) throw new Error('Isolated fixture requires development mode')
const homeworkId=new URLSearchParams(location.search).get('id')!
const me=await fetch('/api/auth/me').then(r=>r.json())
useAuth.setState({user:me.user,companies:me.companies,activeCompanyId:'e2e-school',ready:true,authenticated:true})
const message=deserializeMessage(createNativeMessage({id:'native-homework-tool',role:'assistant',status:{type:'complete',reason:'stop'},
  content:[{type:'tool-call',toolCallId:'native-homework-tool',toolName:'teacher.draft_homework',args:{},argsText:'{}',result:{status:'completed',value:{result:{homeworkId,courseId:'e2e-course'}}}}],
  custom:{activityPresentation:{version:1},harnessControl:false},
}))
function Message(){return <MessagePrimitive.Root><NativeMessageContent/></MessagePrimitive.Root>}
function Fixture(){
  const runtime=useExternalStoreRuntime({messages:[message],isRunning:false,onNew:async()=>{}})
  return <AppThemeProvider><TooltipProvider><main className="mx-auto max-w-3xl p-4"><AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Messages components={{Message}}/></ThreadPrimitive.Root></AssistantRuntimeProvider></main></TooltipProvider></AppThemeProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
