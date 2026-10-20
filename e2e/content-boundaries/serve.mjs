import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, realpathSync } from 'node:fs'
const root = process.cwd(), port = Number(process.env.CONTENT_BOUNDARY_PORT || 5391)
const base = {id:'boundary-homework',courseId:'boundary-course',title:'Synthetic criteria',instructions:'Synthetic current instructions',criteria:['Explain the first inference','Verify the second result'],links:[],attachments:[],dueAt:null,status:'DRAFT',revision:1,visibleHash:'synthetic',createdBy:'boundary-teacher',validation:{status:'READY',revision:1,feedback:''},canEditDraft:true,canPublish:true}
let homework = structuredClone(base), patches = []
const fixture = {name:'content-boundary-fixture',enforce:'pre',transform(source,id) {
  // Optional frozen source overlay for reproducing upstream native regression failures.
  // Only the two editor modules changed by this patch may be overlaid.
  if (process.env.CONTENT_BOUNDARY_BASELINE) {
    for (const name of ['ContentEditor.tsx', 'document.ts'])
      if (id.endsWith(`/src/features/content-editor/${name}`))
        return readFileSync(`${process.env.CONTENT_BOUNDARY_BASELINE}/${name}`, 'utf8')
  }
  if(id.endsWith('/src/features/learning/homework/HomeworkDraftCard.tsx')) return `${source}\nexport { HomeworkDraftCard };\n`
},configureServer(server) { server.middlewares.use(async(req,res,next)=>{
  const send = (body,status=200) => {res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))}
  if(req.url==='/boundary/reset') {let raw='';for await(const chunk of req)raw+=chunk; homework={...structuredClone(base),...(raw?JSON.parse(raw):{})}; patches=[]; return send({homework})}
  if(req.url==='/boundary/evidence') return send({base,homework,patches})
  if(req.url==='/api/courses/boundary-course/homeworks/boundary-homework') return send({homework,teacher:true})
  if(req.url==='/api/courses/boundary-course/homeworks/boundary-homework/draft'&&req.method==='PATCH') {
    let raw='';for await(const chunk of req)raw+=chunk;const data=JSON.parse(raw);patches.push(data);homework={...homework,...data,revision:homework.revision+1};return send({homework,teacher:true})
  }
  if(req.url==='/api/uploads/capabilities') return send({maxBytes:1048576,allowedMimes:[]})
  if(req.url?.startsWith('/api/')) return send({error:'unhandled isolated fixture route'},404)
  next()
})}}
const server = await createServer({configFile:false,root,cacheDir:root+'/.codex-tmp/content-boundary-vite',plugins:[fixture,react()],resolve:{alias:{'@':root+'/src'},dedupe:['@assistant-ui/react','@assistant-ui/core','@assistant-ui/store','@assistant-ui/tap','yjs','y-prosemirror','prosemirror-model','prosemirror-state','prosemirror-view','prosemirror-transform']},optimizeDeps:{entries:['e2e/content-boundaries/fixture.html','e2e/content-editor.html']},server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[root,realpathSync(root+'/node_modules')]},watch:{ignored:['**/.codex-tmp/**','**/docs/evidence/**']}}})
await server.listen();console.log('content boundary fixture ready')
