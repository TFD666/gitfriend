import { createContext, useCallback, useContext, useState } from 'react'

const ToastContext = createContext(null)

let nextId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback(({ message, variant = 'success' }) => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, message, variant }])
    setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 9999,
        }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className="animate-slide-up"
            onClick={() => dismiss(t.id)}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${t.variant === 'error' ? 'var(--danger)' : 'var(--success)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              fontSize: '13px',
              color: 'var(--text-primary)',
              maxWidth: '320px',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
