'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// Lightweight toast notification system.
//
// Usage:
//   import { ToastProvider, useToast } from '@/components/Toast'
//   // Wrap your page (or layout) once:
//   <ToastProvider>{children}</ToastProvider>
//   // In any component below:
//   const toast = useToast()
//   toast.success('Saved')
//   toast.error('Could not save: ...')
//   toast.info('Heads up: ...')
//   // Confirm replaces window.confirm with a nice modal:
//   const ok = await toast.confirm('Delete this rule?', { confirmLabel: 'Delete', tone: 'danger' })

const ToastCtx = createContext(null)

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])     // [{ id, tone, text }]
  const [confirmState, setConfirmState] = useState(null)  // { text, opts, resolve }

  const remove = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((tone, text, opts = {}) => {
    const id = Math.random().toString(36).slice(2)
    const ttl = opts.duration ?? (tone === 'error' ? 6000 : 4000)
    setToasts(prev => [...prev, { id, tone, text, ttl }])
    setTimeout(() => remove(id), ttl)
    return id
  }, [remove])

  const api = {
    success: (text, opts) => push('success', text, opts),
    error:   (text, opts) => push('error', text, opts),
    info:    (text, opts) => push('info', text, opts),
    confirm: (text, opts = {}) =>
      new Promise((resolve) => setConfirmState({ text, opts, resolve })),
  }

  const resolveConfirm = (value) => {
    if (confirmState) {
      confirmState.resolve(value)
      setConfirmState(null)
    }
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}

      {/* Stack of toasts (top-right) */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <ToastRow key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>

      {/* Confirm modal */}
      {confirmState && (
        <ConfirmModal
          text={confirmState.text}
          opts={confirmState.opts}
          onResolve={resolveConfirm}
        />
      )}
    </ToastCtx.Provider>
  )
}

function ToastRow({ toast, onClose }) {
  const [leaving, setLeaving] = useState(false)
  // Brief entrance animation
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 10)
    return () => clearTimeout(t)
  }, [])

  const tone = toast.tone
  const cls = (
    tone === 'success' ? 'border-green-500/40 bg-green-500/10 text-green-200' :
    tone === 'error'   ? 'border-red-500/40 bg-red-500/10 text-red-200' :
                         'border-[#4f46e5]/40 bg-[#4f46e5]/10 text-indigo-200'
  )
  const icon = tone === 'success' ? '✓' : tone === 'error' ? '✗' : 'ℹ'

  return (
    <div
      className={`pointer-events-auto min-w-[280px] max-w-md border rounded-xl px-4 py-3 shadow-2xl backdrop-blur-sm transition-all duration-200 ${cls} ${entered && !leaving ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-base font-bold flex-shrink-0 leading-none mt-0.5">{icon}</span>
        <p className="text-sm leading-relaxed flex-1 break-words">{toast.text}</p>
        <button
          onClick={() => { setLeaving(true); setTimeout(onClose, 200) }}
          className="text-current/60 hover:text-current text-xs flex-shrink-0 leading-none mt-0.5"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function ConfirmModal({ text, opts, onResolve }) {
  // Esc / Enter shortcuts feel native
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onResolve(false)
      if (e.key === 'Enter') onResolve(true)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onResolve])

  const title = opts.title || 'Are you sure?'
  const confirmLabel = opts.confirmLabel || 'Confirm'
  const cancelLabel = opts.cancelLabel || 'Cancel'
  const tone = opts.tone || 'primary'  // 'primary' | 'danger'
  const confirmCls = tone === 'danger'
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-[#4f46e5] hover:bg-[#4338ca]'

  return (
    <div
      className="fixed inset-0 z-[210] bg-black/80 flex items-center justify-center p-4"
      onClick={() => onResolve(false)}
    >
      <div
        className="bg-[#111111] border border-[#1f1f1f] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <p className="text-white font-semibold">{title}</p>
          <p className="text-sm text-[#9ca3af] mt-2 leading-relaxed whitespace-pre-wrap">{text}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onResolve(false)}
            className="flex-1 text-[#9ca3af] hover:text-white text-sm py-2.5 rounded-lg border border-[#1f1f1f]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => onResolve(true)}
            className={`flex-1 text-white text-sm font-medium py-2.5 rounded-lg ${confirmCls}`}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
