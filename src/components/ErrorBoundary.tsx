import { Button } from '@/components/ui/button'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null; resetKey: number }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in the console so devtools shows the full stack + the
    // React component stack (which the default fallback drops).
    console.error('[ErrorBoundary] caught', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" className="fixed inset-0 grid place-items-center bg-background p-6 text-foreground">
          <div className="flex max-w-sm flex-col items-center gap-2 text-center">
            <h1 className="font-heading text-xl font-semibold">页面暂时无法显示</h1>
            <p className="text-sm leading-6 text-muted-foreground">请再试一次，或刷新应用。你的学习记录不会受到影响。</p>
            <div className="mt-3 flex justify-center gap-2">
              <Button onClick={() => this.setState({ error: null, resetKey: this.state.resetKey + 1 })}>再试一次</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>刷新应用</Button>
            </div>
          </div>
        </div>
      )
    }
    // The resetKey forces React to remount children when "Reset view"
    // is pressed — wipes any persisted in-component state that may
    // have caused the crash without dropping the auth session.
    return <div key={this.state.resetKey}>{this.props.children}</div>
  }
}
