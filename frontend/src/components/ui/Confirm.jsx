import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ConfirmCtx = createContext(null);

const TONES = {
  danger: {
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    iconBg: 'bg-red-lt text-red',
    btn: 'bg-red text-white hover:opacity-90',
  },
  primary: {
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    iconBg: 'bg-blue-lt text-blue',
    btn: 'bg-blue text-white hover:opacity-90',
  },
};

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ tone: 'danger', confirmLabel: 'Delete', cancelLabel: 'Cancel', ...opts });
    });
  }, []);

  function done(result) {
    if (resolveRef.current) resolveRef.current(result);
    resolveRef.current = null;
    setState(null);
  }

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 bg-ink/55 backdrop-blur-sm z-[1100] flex items-center justify-center p-5 animate-pop-in"
          onClick={(e) => { if (e.target === e.currentTarget) done(false); }}
        >
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-[440px] overflow-hidden border border-bd/50">
            <div className="px-6 pt-6 pb-5 flex items-start gap-4">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0 ${TONES[state.tone].iconBg}`}>
                {TONES[state.tone].icon}
              </div>
              <div className="flex-1">
                {state.title && (
                  <h3 className="text-[15px] font-bold text-ink mb-1.5">{state.title}</h3>
                )}
                <p className="text-[13.5px] text-ink-muted leading-relaxed">{state.message}</p>
              </div>
            </div>
            <div className="bg-bg px-6 py-3.5 flex justify-end gap-2 border-t border-bd">
              <button
                type="button"
                onClick={() => done(false)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-ink-muted bg-white border border-bd hover:bg-bg3 cursor-pointer transition-colors"
              >
                {state.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => done(true)}
                className={`px-4 py-2 rounded-lg text-[13px] font-semibold border-none cursor-pointer transition-all ${TONES[state.tone].btn}`}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be inside <ConfirmProvider>');
  return ctx;
}
