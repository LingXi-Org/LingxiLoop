import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { CaseCover, caseCoverIdentity, caseCoverPending } from '../src/features/cases/CaseCover'
import { casesApi, type CaseArticle } from '../src/features/cases/api'
import { mergeCaseCoverMetadata } from '../src/features/cases/cover/polling'
import { useCaseCoverPolling } from '../src/features/cases/cover/useCaseCoverPolling'
import { useAuth } from './case-cover-live-auth'
import '../src/styles/globals.css'
function Fixture(){
 const [article,setArticle]=useState<CaseArticle|null>(null),[mounted,setMounted]=useState(true),[epoch,setEpoch]=useState(0),[error,setError]=useState(''),[hidden,setHidden]=useState(false)
 const load=async()=>{
  const response=await fetch('/__cover-fixture/session',{credentials:'include'});if(!response.ok)throw Error('fixture login failed '+response.status)
  const identity=await response.json();useAuth.setState({user:identity.user,activeCompanyId:identity.companyId})
  const next=await casesApi.detail(identity.caseId);setArticle(next)
 }
 useEffect(()=>{void load().catch(reason=>setError(String(reason)))},[])
 useCaseCoverPolling({scopeKey:article?`${article.companyId}:${article.id}:${caseCoverIdentity(article.generatedCover)}`:'empty',pending:caseCoverPending(article?.generatedCover),
  refresh:signal=>casesApi.detail(article!.id,signal),receive:next=>{setArticle(current=>current?mergeCaseCoverMetadata(current,next):current);return caseCoverPending(next.generatedCover)}})
 return <main style={{padding:12,maxWidth:424,margin:'auto'}}>
  <h1>真实已保存案例封面</h1>
  <p>本地合成身份；真实数据库/API资产与生产CaseCover组件。</p>
  {error&&<p role="alert">{error}</p>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBlock:12}}>
   <button type="button" onClick={()=>{setMounted(value=>!value);if(!mounted)void load().catch(reason=>setError(String(reason)))}}>重新打开历史封面</button>
   <button type="button" onClick={()=>setEpoch(value=>value+1)}>切换呈现范围</button>
   <button type="button" onClick={()=>setHidden(value=>!value)}>切换封面可见性</button>
  </div>
  {article&&<section hidden={hidden} data-live-cover data-generation={article.generatedCover?.generation} data-fingerprint={article.generatedCover?.fingerprint} data-status={article.generatedCover?.status}>
   <h2>{article.title}</h2>
   {mounted&&<CaseCover cover={article.generatedCover} fallbackUrl={article.cover} title={article.title} scopeKey={`${useAuth.getState().user?.id}:${article.companyId}:${article.id}:view-${epoch}`}/>}
  </section>}
  <div style={{height:'120vh'}} aria-hidden="true"/>
 </main>
}
createRoot(document.getElementById('root')!).render(<ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}><Fixture/></ThemeProvider>)
