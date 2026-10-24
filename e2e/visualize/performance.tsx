import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GenUiCard } from '@/features/chat/visualize/zcode/gen-ui/components/GenUiCard'
import { useAuth } from '@/stores/auth'
import { setWorkspaceSession } from '@/lib/workspaceSession'
import '@/styles/globals.css'

useAuth.setState({activeCompanyId:'fixture-company',ready:true,user:{id:'fixture-student',email:'student@example.invalid',name:'学生'}})
setWorkspaceSession({companyId:'fixture-company',projectId:'fixture-project'})
await fetch('/__visualize_fixture/reset')
type Selection = { id:string; kind:'static'|'interactive'; count:number }
function Fixture() {
  const [selection,setSelection]=useState<Selection|null>(null)
  Object.assign(window,{selectVisualizePerf:setSelection})
  return <main className="mx-auto max-w-3xl p-6"><h1>已保存作品的启动验收</h1>
    <p className="py-3">公开本地夹具：生成、保存与正式交付已经完成。此页面只测量打开后的宿主路径。</p>
    {selection&&<section data-perf-selection={selection.id}>{Array.from({length:selection.count},(_,index)=>{
      const target={workspaceIdentity:'fixture-company',workspacePath:'fixture-project',sessionId:'fixture-perf',
        path:`/fixture/performance-${selection.kind}-${selection.id}-${index}.html`,instanceKey:`${selection.id}-${index}`,sourceMessageId:`source-${selection.id}-${index}`}
      return <GenUiCard key={`${selection.id}-${index}`} target={target} reference={{path:target.path,title:`网络拓扑 ${index+1}`}}/>
    })}</section>}
  </main>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
