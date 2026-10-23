import { createRoot } from 'react-dom/client'
import { NewConversationDialog } from '../../src/features/conversations/components/NewConversationDialog'
import { useParticipants } from '../../src/features/agents/state'
import { useConversations } from '../../src/features/conversations/store'
import { useAuth } from '../../src/stores/auth'
import { setWorkspaceSession } from '../../src/lib/workspaceSession'
import { TooltipProvider } from '../../src/components/ui/tooltip'
import '../../src/styles/globals.css'

const mode = new URLSearchParams(location.search).get('mode')
const ids = ['sinan','xunzhi','chengqi','mingli','suyuan','lisi']
const names = ['司南','寻知','成器','明理','溯源','砺思']
useAuth.setState({ activeCompanyId:'fixture-company',user:{id:'fixture-user',name:'测试用户',email:'fixture@example.invalid',emailVerified:true,providers:[]} })
setWorkspaceSession({companyId:'fixture-company',projectId:'fixture-project'})
useParticipants.setState({loaded:true,byId:Object.fromEntries(ids.map((id,i)=>[id,{id,kind:'agent',name:names[i],initial:names[i][0],avatarBg:'transparent',status:'avail'}]))})
const requests: Array<{participantIds:string[];requestId?:string}> = []
const committed = new Set<string>()
window.fetch = async (input,init) => {
  if (!String(input).endsWith('/projects/fixture-project/conversations')) throw new Error('Unexpected fixture request')
  const body = JSON.parse(String(init?.body)); requests.push(body)
  document.getElementById('requests')!.textContent=JSON.stringify(requests)
  if (mode==='validation') return Response.json({error:'participants must be active in this workspace',code:'invalid_members'},{status:400})
  committed.add(body.requestId ?? `unkeyed-${requests.length}`)
  document.getElementById('committed')!.textContent=String(committed.size)
  if (requests.length===1) throw new TypeError('Simulated lost creation response')
  return Response.json({id:'created-group',created:false})
}
useConversations.setState({reload:async()=>{useConversations.setState({projectId:'fixture-project',loaded:true,loading:false,error:null,list:[{id:'created-group',kind:'group',title:'测试群',members:['fixture-user',...ids]} as never]})}})
createRoot(document.getElementById('root')!).render(<TooltipProvider><NewConversationDialog companyId="fixture-company" projectId="fixture-project" isMobile={false} onCreated={id=>{document.getElementById('opened')!.textContent=id}}/><output id="opened"/><output id="requests"/><output id="committed"/></TooltipProvider>)
