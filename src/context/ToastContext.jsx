import { createContext, useContext, useState, useCallback } from 'react'
import { EXPLORER_URL } from '../config/wagmi'

// ============================================================
// Toast Context — 3 states: pending, confirmed, failed
// ============================================================

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const showPending = useCallback((message) => {
    setToast({ type: 'pending', message })
  }, [])

  const showConfirmed = useCallback((txHash, message = 'Transaction confirmed ✓') => {
    setToast({ type: 'confirmed', message, txHash })
    setTimeout(() => setToast(null), 8000)
  }, [])

  const showFailed = useCallback((error) => {
    let errorMsg = 'Transaction failed'
    if (error?.shortMessage) errorMsg = error.shortMessage
    else if (error?.message) {
      const revertMatch = error.message.match(/reverted with reason string '(.+?)'/)
      errorMsg = revertMatch ? revertMatch[1] : error.message.slice(0, 120)
    }
    setToast({ type: 'failed', message: errorMsg })
    setTimeout(() => setToast(null), 6000)
  }, [])

  const dismiss = useCallback(() => setToast(null), [])

  return (
    <ToastContext.Provider value={{ toast, showPending, showConfirmed, showFailed, dismiss }}>
      {children}
      {toast && <ToastNotification toast={toast} onDismiss={dismiss} />}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

function ToastNotification({ toast, onDismiss }) {
  return (
    <div
      className={`toast toast-${toast.type}`}
      style={{ cursor: 'pointer' }}
      onClick={onDismiss}
    >
      <div className="toast-icon">
        {toast.type === 'pending' && <div className="spinner" />}
        {toast.type === 'confirmed' && (
          <svg viewBox="0 0 20 20" fill="none" style={{ color: 'var(--accent-primary)' }}>
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 10l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {toast.type === 'failed' && (
          <svg viewBox="0 0 20 20" fill="none" style={{ color: 'var(--danger)' }}>
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="toast-content">
        <div className="toast-title">{toast.message}</div>
        {toast.type === 'confirmed' && toast.txHash && (
          <a
            className="toast-link"
            href={`${EXPLORER_URL}/tx/${toast.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
          >
            View on Explorer →
          </a>
        )}
        {toast.type === 'pending' && (
          <div className="toast-subtitle">Please wait, do not close this page</div>
        )}
      </div>
    </div>
  )
}
