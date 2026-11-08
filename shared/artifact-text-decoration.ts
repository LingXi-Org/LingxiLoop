/** Expand this shorthand before changing one part; keep companion declarations. */
export function expandTextDecoration(value:string):Record<string,string>{
 const important=/\s*!important\s*$/i.test(value),raw=value.replace(/\s*!important\s*$/i,'').trim(),tokens:string[]=[]
 let depth=0,token=''
 for(const char of raw){if(char==='(')depth++;else if(char===')')depth--;if(/\s/.test(char)&&depth===0){if(token)tokens.push(token);token=''}else token+=char}
 if(token)tokens.push(token)
 const values:Record<string,string>={'text-decoration-line':'none','text-decoration-style':'solid','text-decoration-color':'currentcolor','text-decoration-thickness':'auto'},lines:string[]=[]
 if(/^(inherit|initial|unset|revert|revert-layer)$/i.test(raw))for(const name of Object.keys(values))values[name]=raw
 else for(const item of tokens){
  if(/^(none|underline|overline|line-through|blink)$/i.test(item))lines.push(item)
  else if(/^(solid|double|dotted|dashed|wavy)$/i.test(item))values['text-decoration-style']=item
  else if(/^(auto|from-font)$|^[+-]?(?:\d|\.\d)|^(?:calc|min|max|clamp)\(/i.test(item))values['text-decoration-thickness']=item
  else values['text-decoration-color']=item
 }
 if(lines.length)values['text-decoration-line']=lines.join(' ')
 return Object.fromEntries(Object.entries(values).map(([name,value])=>[name,value+(important?' !important':'')]))
}
