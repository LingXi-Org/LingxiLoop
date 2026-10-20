import { useEffect,useState } from 'react'
import {applyTheme} from '../../third_party/zcode/upstream/packages/ui/src/useTheme'
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
document.documentElement.setAttribute('data-zcode-browser-theme-surface','')
applyTheme(dark?'dark':'light')
useAuth.setState({activeCompanyId:'fixture-company',ready:true})
setWorkspaceSession({companyId:'fixture-company',projectId:'fixture-project'})
const runKey=`visualize-fixture:${params.toString()}`
if(!sessionStorage.getItem(runKey)){
  await fetch(`/__visualize_fixture/reset?failOnce=${params.get('failOnce')??'0'}`)
  sessionStorage.setItem(runKey,'1')
}
function Fixture(){
  const [session,setSession]=useState('A'),[follows,setFollows]=useState<string[]>([]),[activePages,setActivePages]=useState(-1)
  const [pageIndex,setPageIndex]=useState(0),[mounted,setMounted]=useState(true),[invalidated,setInvalidated]=useState(false)
  const capacity=params.has('capacity'),bridge=params.has('bridge')
  useEffect(()=>{
    const timer=setInterval(()=>{void fetch('/__visualize_fixture/evidence').then(r=>r.json()).then(data=>{setFollows(data.follows);setActivePages(data.activePages)})},100)
    return()=>clearInterval(timer)
  },[])
  const target={workspacePath:'fixture-project',workspaceIdentity:'fixture-company',sessionId:`fixture-channel-${session}`,path:params.has('corners')?'/fixture/corners.html':bridge?'/fixture/bridge.html':capacity?`/fixture/capacity-${pageIndex}.html`:'/fixture/acceptance.html',instanceKey:`fixture-instance-${pageIndex}`,sourceMessageId:'fixture-source'}
  const Card=params.get('implementation')==='upstream'?UpstreamCard:ProductCard
  return <><main className="zcode-visualize fixture-stage">{mounted&&<Card key={`${session}:${pageIndex}`} target={target} reference={{path:target.path,title:'Field recordings'}}/>}</main><aside className="fixture-controls" style={capacity||bridge?{position:'fixed',top:'auto',bottom:8,zIndex:100}:undefined}><button type="button" onClick={()=>setSession('A')}>Fixture session A</button><button type="button" onClick={()=>setSession('B')}>Fixture session B</button>{capacity&&<><button type="button" onClick={()=>setPageIndex(value=>value+1)}>Fixture next page</button><button type="button" onClick={()=>setPageIndex(0)}>Fixture first page</button><output data-testid="fixture-page-index">{pageIndex}</output></>}{bridge&&<><button type="button" onClick={()=>void fetch('/__visualize_fixture/invalidate').then(()=>setInvalidated(true))}>Fixture invalidate page</button><button type="button" onClick={()=>{setPageIndex(value=>value+1);setInvalidated(false)}}>Fixture replace page</button><button type="button" onClick={()=>{useAuth.setState({activeCompanyId:null});setMounted(false)}}>Fixture close scope</button><output data-testid="fixture-invalidated">{String(invalidated)}</output></>}<output data-testid="fixture-active-pages">{activePages}</output><output data-testid="fixture-follow-ups">{follows.join('\n')}</output></aside></>
}
createRoot(document.getElementById('root')!).render(<Fixture/> )
