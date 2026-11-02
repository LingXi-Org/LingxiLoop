import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useExternalStoreRuntime, ThreadPrimitive, MessagePrimitive, type ThreadMessage } from '@assistant-ui/react'
import { MarkdownText } from '/src/components/assistant-ui/markdown-text'
import { createMarkdownGreenfieldDocument } from '/src/components/retab/ui/markdown-greenfield-document'
import { MarkdownGreenfieldChunkRenderer } from '/src/components/retab/ui/markdown-greenfield-renderer'
import { MemoContent } from '/src/features/learning/forum/memos/MemoContent'
import { ContentEditor } from '/src/features/content-editor/ContentEditor'
import '/src/styles/globals.css'
import '/src/styles/chat.css'
import 'katex/dist/katex.min.css'

const initial = String.raw`Inline $x_1$, $\sqrt{x}$, $h_t=f(h_{t-1},x_t)$.

$$
x_1
$$

$$
\frac{1}{2}
$$

$$
\begin{bmatrix}1&2\\3&4\end{bmatrix}
$$

$$
\begin{aligned}a&=b+c\\d&=\frac{1}{2}\end{aligned}
$$

$$
\underbrace{x_1+x_2+x_3+x_4+x_5+x_6+x_7+x_8+x_9+x_{10}+x_{11}+x_{12}}_{\text{long formula}}
$$`
function Chat({ text }: { text: string }) {
  const messages: ThreadMessage[] = [{id:'math',role:'assistant',createdAt:new Date(0),content:[{type:'text',text}],status:{type:'complete',reason:'stop'},metadata:{unstable_state:null,unstable_annotations:[],unstable_data:[],steps:[],custom:{}}}]
  const runtime = useExternalStoreRuntime({messages,isRunning:false,onNew:async()=>{}})
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{AssistantMessage:()=> <MessagePrimitive.Parts components={{Text:()=> <MarkdownText agent />}} />}} /></AssistantRuntimeProvider>
}
function App() {
 const [text,setText]=useState(initial)
 const document=createMarkdownGreenfieldDocument(text)
 return <><button id="update" onClick={()=>setText(initial.replaceAll('x_1','x_2'))}>Update</button><div style={{display:'flex',flexWrap:'wrap',gap:32,padding:24}}><section id="chat" style={{width:520.375,minWidth:0}}><h1>Actual chat text</h1><Chat text={text}/></section><section id="file" style={{width:520.375,minWidth:0}}><h1>Actual Markdown file renderer</h1>{document.chunks.map(chunk=><MarkdownGreenfieldChunkRenderer key={chunk.id} chunk={chunk}/>)}</section><section id="forum" style={{width:520.375,minWidth:0}}><h1>Actual forum content</h1><MemoContent content={text}/></section><section id="native" style={{width:520.375,minWidth:0}}><h1>Actual native content editor (read only)</h1><ContentEditor value={text} label="Public math sample" disabled compact onChange={()=>{}}/></section></div></>
}
createRoot(document.getElementById('root')!).render(<App/> )
