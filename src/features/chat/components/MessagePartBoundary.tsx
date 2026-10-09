import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { MessageFooterContents } from '@/components/assistant-ui/message-footer'

/** A bad card must not replace the entire conversation with the app error screen. */
export class MessagePartBoundary extends Component<{ children: ReactNode; resetKey: unknown; running?: boolean }, { failed: boolean; resetKey: unknown }> {
  state = { failed: false, resetKey: this.props.resetKey }
  static getDerivedStateFromError() { return { failed: true } }
  static getDerivedStateFromProps(props: { resetKey: unknown }, state: { resetKey: unknown }) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <div role={this.props.running ? 'status' : 'alert'} className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
      <MessageFooterContents inset={false}>
        {this.props.running ? <p className="text-muted-foreground">正在接收卡片内容…</p> : <>
          <p>这张卡片暂时无法显示。</p><Button type="button" variant="link" size="sm" className="h-auto justify-start px-0" onClick={() => this.setState({ failed: false })}>重试显示</Button>
        </>}
      </MessageFooterContents>
    </div>
  }
}
