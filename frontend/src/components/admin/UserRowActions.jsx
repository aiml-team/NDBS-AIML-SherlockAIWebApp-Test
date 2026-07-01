import { useEffect, useRef, useState } from 'react';

/**
 * Dropdown of admin actions for a single user row.
 *
 * Props:
 *   user            — the target user
 *   currentUserId   — id of the logged-in admin (for self-action protection)
 *   adminCount      — total admin count (for last-admin protection)
 *   onPromote, onDemote, onVerify, onReset, onDelete
 */
export default function UserRowActions({
  user,
  currentUserId,
  adminCount,
  onPromote,
  onDemote,
  onVerify,
  onReset,
  onDelete,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const isSelf = user.id === currentUserId;
  const isLastAdmin = user.is_admin && adminCount <= 1;
  const cannotDemote = isSelf || isLastAdmin;
  const cannotDelete = isSelf || isLastAdmin;

  function act(fn) {
    setOpen(false);
    fn?.(user);
  }

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Actions for ${user.email}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="px-2.5 py-1 rounded-md border border-bd text-ink-muted hover:border-blue-mid hover:bg-blue-lt hover:text-blue cursor-pointer text-[13px] font-bold transition-colors bg-white"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] w-[220px] bg-white border border-bd rounded-xl shadow-soft p-1.5 z-[250] animate-pop-in"
        >
          {user.is_admin ? (
            <MenuItem
              disabled={cannotDemote}
              disabledHint={isSelf ? 'You cannot demote yourself' : 'Cannot demote the last admin'}
              onClick={() => act(onDemote)}
              icon={
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
                  <path d="M8 1a.75.75 0 0 1 .75.75v7.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V1.75A.75.75 0 0 1 8 1Z" />
                </svg>
              }
            >
              Demote from admin
            </MenuItem>
          ) : (
            <MenuItem
              onClick={() => act(onPromote)}
              icon={
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
                  <path d="M8 15a.75.75 0 0 1-.75-.75V6.56L5.03 8.78a.75.75 0 0 1-1.06-1.06l3.5-3.5a.75.75 0 0 1 1.06 0l3.5 3.5a.75.75 0 0 1-1.06 1.06L8.75 6.56v7.69A.75.75 0 0 1 8 15Z" />
                </svg>
              }
            >
              Promote to admin
            </MenuItem>
          )}

          {!user.verified && (
            <MenuItem
              onClick={() => act(onVerify)}
              icon={
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.749.749 0 0 1 1.06-1.06L6 10.939l6.72-6.719a.75.75 0 0 1 1.06 0Z" />
                </svg>
              }
            >
              Mark as verified
            </MenuItem>
          )}

          <MenuItem
            onClick={() => act(onReset)}
            icon={
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z" />
                <path d="m2 4 6 5 6-5" />
              </svg>
            }
          >
            Send password reset
          </MenuItem>

          <div className="h-px bg-bd my-1" />

          <MenuItem
            onClick={() => act(onDelete)}
            icon={
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
                <path d="M6 1.75A.75.75 0 0 1 6.75 1h2.5a.75.75 0 0 1 .75.75V3h3.25a.75.75 0 0 1 0 1.5h-.563l-.6 8.4A2 2 0 0 1 10.092 15H5.908a2 2 0 0 1-1.995-2.1l-.6-8.4H2.75a.75.75 0 0 1 0-1.5H6V1.75ZM4.819 4.5l.588 8.232a.5.5 0 0 0 .499.518h4.188a.5.5 0 0 0 .499-.518L11.181 4.5H4.819Z" />
              </svg>
            }
            danger
            disabled={cannotDelete}
            disabledHint={isSelf ? 'You cannot delete yourself' : 'Cannot delete the last admin'}
          >
            Delete user
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, icon, danger, disabled, disabledHint }) {
  if (disabled) {
    return (
      <div
        title={disabledHint || ''}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-ink-soft/60 cursor-not-allowed select-none"
      >
        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center opacity-60">{icon}</span>
        <span className="flex-1 truncate">{children}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold bg-transparent border-none cursor-pointer transition-colors ${
        danger
          ? 'text-ink-muted hover:bg-red-lt hover:text-red'
          : 'text-ink-muted hover:bg-blue-lt hover:text-blue'
      }`}
    >
      <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">{icon}</span>
      <span className="flex-1 truncate text-left">{children}</span>
    </button>
  );
}
