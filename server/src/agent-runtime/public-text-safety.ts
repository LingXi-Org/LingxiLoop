import type { PublicTextSafetyInput, PublicTextSafetyDecision } from '@lyyzka/lingxios'

const english = [
  ...['think','structure','craft','write'].map(verb => `let me ${verb}`),
  'the user is asking','the user wants',
  ...['should','need to'].flatMap(modal => ['answer','respond','write'].map(verb => `i ${modal} ${verb}`)),
]
const directives = [...english,
  ...['应该','需要','要','现在'].flatMap(modal => ['','直接','先','再'].flatMap(order => ['回复','回应','输出','回答','交付'].map(verb => `我${modal}${order}${verb}`))),
  '最终回复如下','最终中文回复如下','写最终回复','写最终回答','我的角色是','让我理清','让我组织','让我先理清','让我先组织',
  '我应该用结构化','我应该用中文','让我直接给出最终',
]
const directivePattern = new RegExp(`\\b(?:${english.join('|')})|${directives.slice(english.length).join('|')}`,'gi')
const markers = ['think','analysis','reasoning','scratchpad'].flatMap(name => [`<${name}`,`</${name}`])

// Preserve offsets while ignoring explicit Markdown quoted data. Fence headers
// are held until their newline, and unmatched inline ticks remain unapproved.
function proseOf(text: string) {
  let prose = '', pending = text.length, fence: { character: string; count: number } | null = null
  let start = 0
  while (start < text.length) {
    const newline = text.indexOf('\n',start), end = newline < 0 ? text.length : newline + 1
    const line = text.slice(start,newline < 0 ? end : newline)
    if (fence) {
      const match = /^ {0,3}(`+|~+)[\t \r]*$/.exec(line)
      if (match?.[1][0] === fence.character && match[1].length >= fence.count && newline >= 0) fence = null
      prose += ' '.repeat(end-start)
    } else if (/^ {0,3}>/.test(line)) {
      prose += ' '.repeat(end-start)
    } else {
      const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
      if (opening && (opening[1][0] !== '`' || !opening[2].includes('`'))) {
        if (newline < 0) pending = Math.min(pending,start + line.indexOf(opening[1]))
        else fence = { character: opening[1][0],count: opening[1].length }
        prose += ' '.repeat(end-start)
      } else {
        if (newline < 0 && /^ {0,3}~{1,2}$/.test(line)) pending = Math.min(pending,start+line.indexOf('~'))
        let index = start
        while (index < end) {
          const character = text[index]
          if (character === '\\' && /[\\`<>~]/.test(text[index+1] ?? '')) {
            prose += '  '; index += 2; continue
          }
          if (character === '`') {
            let count = 1; while (text[index+count] === '`') count++
            let close = index+count, found = false
            while (close < end && text[close] !== '\n') {
              if (text[close] !== '`') { close++; continue }
              let closing = 1; while (text[close+closing] === '`') closing++
              if (closing === count) { close += closing; found = true; break }
              close += closing
            }
            if (!found) { pending = Math.min(pending,index); prose += ' '.repeat(end-index); index = end }
            else { prose += ' '.repeat(close-index); index = close }
          } else { prose += character; index++ }
        }
      }
    }
    start = end
  }
  return { prose,pending }
}

/** Syntax-only publication gate. It neither edits text nor validates citations. */
export function publicTextSafety({ text,isFinal,approvedThrough }: Readonly<PublicTextSafetyInput>): PublicTextSafetyDecision {
  // Bound repeated cumulative scans even for one-character provider chunks.
  // The runtime pauses this optional public segment after its suffix budget;
  // it still checks the complete final text once and can deliver a safe answer.
  if (!isFinal && text.length > 8192) return { safeThrough: approvedThrough }
  const { prose,pending } = proseOf(text)
  let safeThrough = pending
  const lower = prose.toLowerCase()
  for (let index = lower.indexOf('<'); index >= 0; index = lower.indexOf('<',index+1)) {
    const tail = lower.slice(index)
    if (tail.startsWith('<|')) return { safeThrough: approvedThrough,reject: 'unsafe_content' }
    if (tail === '<') safeThrough = Math.min(safeThrough,index)
    for (const marker of markers) {
      if (marker.startsWith(tail)) safeThrough = Math.min(safeThrough,index)
      if (tail.startsWith(marker) && /^[\s/>]/.test(tail.slice(marker.length))) return { safeThrough: approvedThrough,reject: 'unsafe_content' }
    }
  }
  const matches = [...prose.matchAll(directivePattern)]
  if (matches.length >= 3 && new Set(matches.map(match => match[0].toLowerCase())).size >= 2) return { safeThrough: approvedThrough,reject: 'unsafe_content' }
  // A later directive can make the whole cluster unsafe. Do not publish its
  // first phrase and try to retract it later. A final isolated teaching phrase
  // is allowed; long ambiguity pauses optional publication in the runtime.
  if (!isFinal) {
    if (matches[0]) safeThrough = Math.min(safeThrough,matches[0].index)
    for (const directive of directives) {
      for (let length = Math.min(directive.length-1,lower.length); length > 0; length--) {
        const index = lower.length-length
        if (lower.slice(index) !== directive.slice(0,length)) continue
        if (/^[a-z]/.test(directive) && index > 0 && /[a-z0-9_]/i.test(lower[index-1])) continue
        safeThrough = Math.min(safeThrough,index); break
      }
    }
  }
  // A high surrogate can be the first half of the next provider chunk.
  if (safeThrough > 0 && /[\uD800-\uDBFF]/.test(text[safeThrough-1])) safeThrough--
  if (safeThrough < approvedThrough) return { safeThrough: approvedThrough,reject: 'unsupported_content' }
  return { safeThrough }
}
