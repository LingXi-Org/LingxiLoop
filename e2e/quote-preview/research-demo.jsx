import React from 'react'
import {createRoot} from 'react-dom/client'
import {ReplyMessage} from 'react-chat-elements'
import QuoteMessage from '@sendbird/uikit-react/ui/QuoteMessage'
import 'react-chat-elements/dist/main.css'
import '@sendbird/uikit-react/dist/index.css'
const text='使用可视化为我讲解 KV 缓存。长文本在引用预览中应紧凑截断，保持清晰的作者与正文层级。'
const parent={messageId:1,message:text,sender:{userId:'colleague',nickname:'陈晨'},isUserMessage:()=>true,isFileMessage:()=>false,isAdminMessage:()=>false}
const message={messageId:2,parentMessage:parent,sender:{userId:'me',nickname:'林悦'},isUserMessage:()=>true,isFileMessage:()=>false,isAdminMessage:()=>false}
createRoot(document.getElementById('root')).render(<main style={{padding:32,fontFamily:'Arial,sans-serif',color:'#1c2925',background:'#f7f9f8',height:'100vh',boxSizing:'border-box'}}>
<h1 style={{fontSize:22}}>开源引用组件 · 原始组件实渲染</h1><p>相同内容 · 独立本地 demo · 未修改组件样式</p>
<div style={{display:'flex',gap:28,marginTop:32}}>
<section style={{width:360,background:'#fff',padding:24,borderRadius:16}}><h2 style={{fontSize:18}}>React Chat Elements</h2><p>ReplyMessage · MIT</p><div style={{background:'#d9fdd3',padding:'12px',borderRadius:14,marginTop:24}}><ReplyMessage title="陈晨" titleColor="#347f67" message={text}/><div>请重试这条消息。</div></div></section>
<section className="sendbird-theme--light" style={{width:360,background:'#fff',padding:24,borderRadius:16}}><h2 style={{fontSize:18}}>Sendbird UIKit</h2><p>QuoteMessage · MIT</p><div style={{marginTop:24}}><QuoteMessage message={message} userId="me" isByMe/><div style={{background:'#d9fdd3',padding:12,borderRadius:14,marginTop:4}}>请重试这条消息。</div></div></section>
</div></main>)
