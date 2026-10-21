import { readFileSync } from 'node:fs'
import { renderSlidingWindow } from '../../server/src/im/visualize-sliding-window'

// Product renderer plus isolated test-only disturbances. No user source/data.
export function windowFixture() {
  const font = readFileSync('node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2').toString('base64')
  return renderSlidingWindow({ title: 'Packet window geometry', packetCount: 18, windowSize: 4 }).html
    + renderSlidingWindow({ title: 'Independent instance', packetCount: 6, windowSize: 2 }).html
    + `<div><button type="button" data-test-broken>Show nominal-width failure</button><button type="button" data-test-layout>Change inner geometry</button><button type="button" data-test-font>Load local font</button><button type="button" data-test-hidden>Hide and reveal row</button><output data-font-status>waiting</output></div>
<div data-broken-row hidden style="position:relative;display:flex;gap:8px;width:360px;margin:12px 0">${Array.from({ length: 8 }, (_, i) => `<div data-broken-packet="${i}" style="flex:0 1 72px;min-width:0;height:40px;border:1px solid #aaa;box-sizing:border-box">${i}</div>`).join('')}<div data-broken-outline style="position:absolute;left:0;top:0;width:312px;height:40px;box-sizing:border-box;border:2px solid #3775df;pointer-events:none"></div></div>
<script>(()=>{
  const root=document.querySelector('.lx-window'),row=root.querySelector('[data-window-row]');
  // Non-uniform, content-driven widths expose fixed-width arithmetic.
  root.querySelectorAll('[data-packet]').forEach((packet,i)=>{packet.style.flex='1 1 auto';packet.style.paddingInline=(i%3+1)*3.25+'px'});
  document.querySelector('[data-broken-row]').style.display='none';
  document.querySelector('[data-test-broken]').onclick=()=>{const broken=document.querySelector('[data-broken-row]');broken.hidden=false;broken.style.display='flex'};
  document.querySelector('[data-test-layout]').onclick=()=>{
    Object.assign(row.style,{gap:'11.25px',border:'3.5px solid transparent',padding:'7.25px',width:'900px',transform:'scale(.85)',transformOrigin:'0 0',zoom:'1.1'});
    root.querySelector('.lx-window-scroll').scrollLeft=75;
  };
  document.querySelector('[data-test-font]').onclick=async()=>{
    const face=new FontFace('WindowRegression','url(data:font/woff2;base64,${font})');
    document.fonts.add(face);row.style.fontFamily='WindowRegression,monospace';row.style.fontSize='21.5px';
    await face.load();await document.fonts.ready;document.querySelector('[data-font-status]').textContent='loaded';
  };
  document.querySelector('[data-test-hidden]').onclick=()=>{row.style.display='none';setTimeout(()=>{row.style.display='flex'},100)};
})();</script>`
}
