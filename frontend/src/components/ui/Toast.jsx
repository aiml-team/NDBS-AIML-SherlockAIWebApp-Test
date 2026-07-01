import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastCtx = createContext(null);

const ICONS = {
  success: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.749.749 0 0 1 1.06-1.06L6 10.939l6.72-6.719a.75.75 0 0 1 1.06 0Z" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
      <path d="M2.343 13.657A8 8 0 1 1 13.657 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.75.75 0 0 0-1.06 1.06L6.94 8l-1.97 1.97a.75.75 0 1 0 1.06 1.06L8 9.06l1.97 1.97a.75.75 0 1 0 1.06-1.06L9.06 8l1.97-1.97a.75.75 0 0 0-1.06-1.06L8 6.94Z" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
      <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </svg>
  ),
};

const TONES = {
  success: 'border-green-mid bg-green-lt text-green-dark',
  error: 'border-red-mid bg-red-lt text-red',
  info: 'border-blue-mid bg-blue-lt text-blue-dark',
};

function ToastItem({ toast, onClose }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-3 min-w-[280px] max-w-[420px] border ${TONES[toast.kind]} px-4 py-3 rounded-xl shadow-soft animate-pop-in font-sans`}
    >
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/70 flex items-center justify-center text-[11px] font-bold">
        {ICONS[toast.kind]}
      </span>
      <div className="flex-1 text-[13px] leading-snug">
        {toast.title && <div className="font-semibold mb-0.5">{toast.title}</div>}
        <div>{toast.message}</div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="flex-shrink-0 text-current/70 hover:opacity-100 cursor-pointer bg-transparent border-none p-0 leading-none flex items-center justify-center"
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
          <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    const ttl = toast.ttl ?? 4500;
    setToasts((t) => [...t, { id, kind: 'info', ...toast }]);
    if (ttl > 0) {
      timers.current[id] = setTimeout(() => dismiss(id), ttl);
    }
    return id;
  }, [dismiss]);

  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
  }, []);

  const api = {
    push,
    dismiss,
    success: (message, opts = {}) => push({ kind: 'success', message, ...opts }),
    error: (message, opts = {}) => push({ kind: 'error', message, ttl: 6500, ...opts }),
    info: (message, opts = {}) => push({ kind: 'info', message, ...opts }),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed bottom-5 right-5 z-[1000] flex flex-col gap-2.5 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onClose={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be inside <ToastProvider>');
  return ctx;
}
