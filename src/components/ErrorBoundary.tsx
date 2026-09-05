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
        <div className="fixed inset-0 grid place-items-center bg-paper p-8">
          <div className="max-w-[460px] text-center">
            <div className="font-display font-medium text-[32px] tracking-tight text-ink-900 mb-2"
              style={{ letterSpacing: '-0.025em' }}>
              页面暂时无法显示
            </div>
            <div className="font-display italic text-[14px] text-ink-500 leading-relaxed mb-5">
              请再试一次，或刷新应用。你的学习记录不会受到影响。
            </div>
            <div className="flex justify-center gap-2">
              <Button
                onClick={() => this.setState({ error: null, resetKey: this.state.resetKey + 1 })}
                className="py-2 px-4 rounded-[10px] text-[13px] font-semibold text-white"
                style={{
                  background: 'linear-gradient(135deg, var(--skype), var(--skype-deep))',
                  boxShadow: '0 6px 16px -4px color-mix(in srgb, var(--primary) 45%, transparent)',
                }}
              >再试一次</Button>
              <Button
                onClick={() => window.location.reload()}
                className="py-2 px-4 rounded-[10px] text-[13px] font-semibold text-ink-700 bg-cloud"
                style={{ border: '1px solid var(--ink-100)' }}
              >刷新应用</Button>
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
