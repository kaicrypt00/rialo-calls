import { Component } from 'react'

/**
 * ErrorBoundary — catches render errors in children and shows a fallback
 * instead of blanking the entire page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div style={{
          padding: '16px 20px',
          borderRadius: 12,
          background: 'rgba(224,85,85,0.08)',
          border: '1px solid rgba(224,85,85,0.25)',
          color: 'var(--danger)',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span>⚠️</span>
          <span>
            <strong>Something went wrong loading this market.</strong>
            {this.props.onReset && (
              <button
                style={{ marginLeft: 10, fontSize: 11, cursor: 'pointer', textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit' }}
                onClick={() => { this.setState({ hasError: false, error: null }); this.props.onReset?.() }}
              >
                Retry
              </button>
            )}
          </span>
        </div>
      )
    }
    return this.props.children
  }
}
