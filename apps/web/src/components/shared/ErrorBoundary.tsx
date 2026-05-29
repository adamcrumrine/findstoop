import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../../lib/analytics'

interface Props { children: ReactNode }
interface State { hasError: boolean }

/**
 * App-root error boundary. Catches render/lifecycle errors anywhere in the
 * tree, reports them to analytics_events, and shows a branded recovery screen
 * instead of React's blank white page. Uncaught *async* errors are handled
 * separately by installGlobalErrorHandlers() — a boundary only sees errors
 * thrown during render, in lifecycle methods, or in constructors.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error.message || 'React render error', {
      source: 'error_boundary',
      component_stack: (info.componentStack ?? '').slice(0, 500),
    })
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm text-mute">
            An unexpected error interrupted this page. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
