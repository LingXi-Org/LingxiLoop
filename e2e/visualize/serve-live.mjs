import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from 'node:path'
const api=`http://127.0.0.1:${process.env.E2E_VISUALIZE_LIVE_API_PORT??'5194'}`
const server=await createServer({configFile:false,plugins:[react()],resolve:{alias:{'@':resolve('src')},dedupe:['react','react-dom','@assistant-ui/react']},cacheDir:'node_modules/.vite-issue193-live',optimizeDeps:{entries:['e2e/visualize/live.html']},server:{host:'127.0.0.1',port:5195,strictPort:true,hmr:false,watch:{ignored:['**/*']},proxy:{'/api':api,'/__visualize_live':api}}})
await server.listen();server.printUrls()
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0)})
