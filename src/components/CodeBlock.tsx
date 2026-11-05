import { useState } from 'react'
import { useTheme } from 'next-themes'
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light'
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark'
import { CodeBlockContainer, CodeBlockCopyButton, CodeBlockDownloadButton, CodeBlockHeader } from 'streamdown'

const aliases: Record<string, string> = { js: 'javascript', ts: 'typescript', html: 'markup', xml: 'markup', sh: 'bash', shell: 'bash', yml: 'yaml', py: 'python' }

/** Upstream owns parsing, token rendering and asynchronous grammar loading. */
export function CodeBlock({ language = 'text', codeContent }: { language?: string; codeContent: string }) {
  const { resolvedTheme, forcedTheme } = useTheme()
  const [copyError, setCopyError] = useState(false)
  const normalized = language.toLowerCase()
  const syntaxLanguage = aliases[normalized] ?? normalized
  return <CodeBlockContainer language={language} className="my-0 min-w-0 max-w-full gap-0 p-0" data-code-renderer="react-syntax-highlighter">
    <div data-code-toolbar className="flex h-11 items-center gap-2 border-b border-border ps-2.5 pe-1.5">
      <span aria-hidden="true" className="grid size-[22px] shrink-0 place-items-center rounded-[7px] bg-[rgb(59_111_216/12%)] text-[#3B6FD8]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" /></svg>
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-[#3B6FD8]"><CodeBlockHeader language={language} /></span>
      <CodeBlockDownloadButton code={codeContent} language={language} aria-label="下载代码" title="下载代码" />
      <CodeBlockCopyButton code={codeContent} aria-label="复制代码" title="复制代码" onCopy={() => setCopyError(false)} onError={() => setCopyError(true)} />
    </div>
    <SyntaxHighlighter language={syntaxLanguage} style={(forcedTheme ?? resolvedTheme) === 'dark' ? oneDark : oneLight}
      showLineNumbers lineNumberStyle={{ minWidth: '18px', paddingRight: '16px', textAlign: 'right', color: '#A3A39E', userSelect: 'none' }}
      customStyle={{ margin: 0, padding: '14px 16px', background: 'var(--card)', color: 'var(--foreground)', fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: 1.75, borderRadius: 0, overflowX: 'auto' }}
      codeTagProps={{ className: `language-${syntaxLanguage}`, style: { fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', background: 'transparent', textShadow: 'none' } }}>
      {codeContent}
    </SyntaxHighlighter>
    {copyError && <p role="status" className="px-3 py-1 text-xs text-muted-foreground">复制失败，请选择代码后复制。</p>}
  </CodeBlockContainer>
}
