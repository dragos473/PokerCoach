/** Catches render errors so one broken view never blanks the whole app. */
import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: (error: Error, reset: () => void) => ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <div role="alert" className="rounded-lg border border-bad/40 bg-bad/5 p-4 text-sm">
        <p className="font-semibold text-bad">Something went wrong in this view.</p>
        <p className="mt-1 font-mono text-xs text-muted">{error.message}</p>
        <div className="mt-3 flex gap-3">
          <button className="text-info underline" onClick={this.reset}>Try again</button>
          <a className="text-info underline" href="#/">Back home</a>
        </div>
      </div>
    )
  }
}
