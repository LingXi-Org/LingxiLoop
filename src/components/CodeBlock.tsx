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
    <div className="flex items-center justify-between gap-2 border-b px-3 py-1">
      <CodeBlockHeader language={language} />
      <div className="flex items-center gap-1">
        <CodeBlockDownloadButton code={codeContent} language={language} aria-label="下载代码" title="下载代码" />
        <CodeBlockCopyButton code={codeContent} aria-label="复制代码" title="复制代码" onCopy={() => setCopyError(false)} onError={() => setCopyError(true)} />
      </div>
    </div>
    <SyntaxHighlighter language={syntaxLanguage} style={(forcedTheme ?? resolvedTheme) === 'dark' ? oneDark : oneLight}
      customStyle={{ margin: 0, padding: '12px', background: 'var(--code-background)', color: 'var(--code-foreground)', fontFamily: 'var(--font-mono)', fontSize: 'var(--content-code-size, 13px)', lineHeight: 1.625, borderRadius: 0, overflowX: 'auto' }}
      codeTagProps={{ className: `language-${syntaxLanguage}`, style: { fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', background: 'transparent', textShadow: 'none' } }}>
      {codeContent}
    </SyntaxHighlighter>
    {copyError && <p role="status" className="px-3 py-1 text-xs text-muted-foreground">复制失败，请选择代码后复制。</p>}
  </CodeBlockContainer>
}
