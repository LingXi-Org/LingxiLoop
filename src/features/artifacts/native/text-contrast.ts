export interface ContrastColor{r:number;g:number;b:number;a:number}
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value))
export function parseContrastColor(input:string):ContrastColor|null{
 const value=input.trim()
 if(value==='transparent')return{r:0,g:0,b:0,a:0}
 if(/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)){
  const hex=value.length<=5?[...value.slice(1)].map(char=>char+char).join(''):value.slice(1)
  return{r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16),a:hex.length===8?parseInt(hex.slice(6,8),16)/255:1}
 }
 const match=/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(value)
 if(!match)return null
 const channel=(text:string,max:number)=>clamp(parseFloat(text)/(text.endsWith('%')?100:1)*(text.endsWith('%')?max:1),0,max)
 const color={r:channel(match[1],255),g:channel(match[2],255),b:channel(match[3],255),a:match[4]===undefined?1:channel(match[4],1)}
 return Object.values(color).every(Number.isFinite)?color:null
}
function luminance(color:ContrastColor){
 const linear=(value:number)=>{const channel=value/255;return channel<=.03928?channel/12.92:((channel+.055)/1.055)**2.4}
 return .2126*linear(color.r)+.7152*linear(color.g)+.0722*linear(color.b)
}
export function compositeContrastColor(foreground:ContrastColor,background:ContrastColor):ContrastColor{
 return{r:foreground.a*foreground.r+(1-foreground.a)*background.r,g:foreground.a*foreground.g+(1-foreground.a)*background.g,b:foreground.a*foreground.b+(1-foreground.a)*background.b,a:1}
}
export function textContrastRatio(foreground:ContrastColor,background:ContrastColor){
 const ink=luminance(compositeContrastColor(foreground,background)),ground=luminance(background)
 return(Math.max(ink,ground)+.05)/(Math.min(ink,ground)+.05)
}
export function textContrastMinimum(size:number,weight:number){return size>=24||size>=18.66&&weight>=700?3:4.5}
export function formatTextContrast(value:number){const truncated=Math.floor((value+1e-9)*10)/10;return truncated<10||!Number.isInteger(truncated)?truncated.toFixed(1):String(truncated)}
