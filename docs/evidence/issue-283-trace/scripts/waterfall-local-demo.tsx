import React,{useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Waterfall} from './waterfall/components/Waterfall'
const items=[{id:'1',name:'index.html',startTime:0,endTime:120,color:'#4a90e2'},{id:'2',name:'app.js',startTime:50,endTime:300,color:'#7b68ee'},{id:'3',name:'styles.css',startTime:60,endTime:180,color:'#50c878'},{id:'4',name:'logo.png',startTime:200,endTime:450,color:'#ff6b6b'},{id:'5',name:'api/user',startTime:350,endTime:650,color:'#feca57'}]
function App(){const [mini,setMini]=useState(false);return <main style={{padding:32,fontFamily:'system-ui',color:'#333'}}><h2>react-waterfall-timeline / official Basic & Mini story args</h2><p>Locally rendered upstream source, unchanged CSS. No built-in dark theme or hierarchical branch toggle.</p><button onClick={()=>setMini(!mini)}>Toggle mini / expanded</button><div style={{height:400,marginTop:20}}><Waterfall items={items} mini={mini} labelWidth={200} rowHeight={32} rulerHeight={40}/></div></main>}
createRoot(document.getElementById('root')!).render(<App/>);
