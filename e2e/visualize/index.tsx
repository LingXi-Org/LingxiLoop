import { useEffect,useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/geist'
import { GenUiCard as ProductCard } from '@/features/chat/visualize/zcode/gen-ui/components/GenUiCard'
import { GenUiCard as UpstreamCard } from '../../third_party/zcode/upstream/packages/ui/src/gen-ui/components/GenUiCard'
import { useAuth } from '@/stores/auth'
import { setWorkspaceSession } from '@/lib/workspaceSession'

const params=new URLSearchParams(location.search)
if(params.get('implementation')==='upstream')await import('../../third_party/zcode/upstream/packages/ui/src/styles.css')
else await import('@/styles/globals.css')
await import('./fixture.css')
const dark=params.get('theme')==='dark'
document.documentElement.classList.toggle('dark',dark)
document.documentElement.classList.toggle('light',!dark)
useAuth.setState({activeCompanyId:'fixture-company',ready:true})
setWorkspaceSession({companyId:'fixture-company',projectId:'fixture-project'})
const runKey=`visualize-fixture:${params.get('implementation')}:${params.get('theme')}`
if(!sessionStorage.getItem(runKey)){
  await fetch(`/__visualize_fixture/reset?failOnce=${params.get('failOnce')??'0'}`)
  sessionStorage.setItem(runKey,'1')
}
function Fixture(){
  const [session,setSession]=useState('A'),[follows,setFollows]=useState<string[]>([])
  useEffect(()=>{
    const timer=setInterval(()=>{void fetch('/__visualize_fixture/evidence').then(r=>r.json()).then(data=>setFollows(data.follows))},100)
    return()=>clearInterval(timer)
  },[])
  const target={workspacePath:'fixture-project',workspaceIdentity:'fixture-company',sessionId:`fixture-channel-${session}`,path:'/fixture/acceptance.html',instanceKey:'fixture-instance',sourceMessageId:'fixture-source'}
  const Card=params.get('implementation')==='upstream'?UpstreamCard:ProductCard
  return <><main className="zcode-visualize fixture-stage"><Card key={session} target={target} reference={{path:target.path,title:'Field recordings'}}/></main><aside className="fixture-controls"><button type="button" onClick={()=>setSession('A')}>Fixture session A</button><button type="button" onClick={()=>setSession('B')}>Fixture session B</button><output data-testid="fixture-follow-ups">{follows.join('\n')}</output></aside></>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
