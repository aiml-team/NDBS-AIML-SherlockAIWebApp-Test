import { useEffect, useState } from 'react';

export default function DeleteUserDialog({ open, user, busy, onCancel, onConfirm }) {
  const [typed, setTyped] = useState('');

  useEffect(() => { if (!open) setTyped(''); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') onCancel(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || !user) return null;

  const canDelete = typed.trim().toLowerCase() === user.email.toLowerCase();

  return (
    <div
      className="fixed inset-0 bg-ink/55 backdrop-blur-sm z-[1100] flex items-center justify-center p-5 animate-pop-in"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-[460px] overflow-hidden border border-bd/50">
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-red-lt text-red flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-current fill-none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-[15px] font-bold text-ink mb-1.5">Delete user</h3>
            <p className="text-[13px] text-ink-muted leading-relaxed">
              This deletes the user account permanently. Any prospects they
              created in Azure Blob are <strong>not</strong> deleted. This
              cannot be undone.
            </p>
          </div>
        </div>
        <div className="px-6 pb-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] text-ink-muted">
              Type <span className="font-semibold text-ink">{user.email}</span> to confirm:
            </span>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
              autoFocus
              className="px-3 py-2 rounded-lg border border-bd bg-white text-[13.5px] text-ink focus:outline-none focus:border-red-mid focus:ring-2 focus:ring-red-lt font-mono"
            />
          </label>
        </div>
        <div className="bg-bg px-6 py-3.5 flex justify-end gap-2 border-t border-bd">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold text-ink-muted bg-white border border-bd hover:bg-bg3 cursor-pointer transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(user)}
            disabled={!canDelete || busy}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-red text-white hover:opacity-90 cursor-pointer transition-all border-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Deleting…' : 'Delete user'}
          </button>
        </div>
      </div>
    </div>
  );
}
