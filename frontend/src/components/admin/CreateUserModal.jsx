import { useEffect, useState } from 'react';

const ALLOWED_DOMAINS = ['@nttdata.com', '@bs.nttdata.com'];

export default function CreateUserModal({ open, onClose, onSubmit, busy }) {
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) {
      setEmail('');
      setIsAdmin(false);
      setLocalError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setLocalError('Email is required.');
      return;
    }
    if (!ALLOWED_DOMAINS.some((d) => trimmed.endsWith(d))) {
      setLocalError('Email must end in @nttdata.com or @bs.nttdata.com.');
      return;
    }
    setLocalError('');
    onSubmit({ email: trimmed, isAdmin });
  }

  return (
    <div
      className="fixed inset-0 bg-ink/55 backdrop-blur-sm z-[1000] flex items-center justify-center p-5 animate-pop-in"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-modal w-full max-w-[460px] overflow-hidden border border-bd/50"
      >
        <div className="px-6 pt-5 pb-3 border-b border-bd">
          <h3 className="text-[15px] font-bold text-ink">Create user</h3>
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            The user receives an email with a code to set their password.
          </p>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono">
              Email
            </span>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              placeholder="alice@nttdata.com"
              className="px-3 py-2 rounded-lg border border-bd bg-white text-[13.5px] text-ink focus:outline-none focus:border-blue-mid focus:ring-2 focus:ring-blue-lt"
            />
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              disabled={busy}
              className="w-4 h-4 accent-blue cursor-pointer"
            />
            <span className="text-[13px] text-ink-muted font-medium">
              Grant admin access immediately
            </span>
          </label>

          {localError && (
            <div className="text-[12.5px] text-red bg-red-lt border border-red-mid rounded-lg px-3 py-2">
              {localError}
            </div>
          )}
        </div>

        <div className="bg-bg px-6 py-3.5 flex justify-end gap-2 border-t border-bd">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold text-ink-muted bg-white border border-bd hover:bg-bg3 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-blue text-white hover:opacity-90 cursor-pointer transition-all border-none disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>
    </div>
  );
}
