import { useEffect } from 'react';

export default function Modal({ open, onClose, title, children, maxWidth = 900 }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-ink/55 backdrop-blur-sm z-[999] flex items-center justify-center p-5 animate-pop-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-[18px] shadow-modal w-full h-[90vh] flex flex-col overflow-hidden border border-bd/50"
        style={{ maxWidth }}
      >
        <div className="flex justify-between items-center px-5 py-3.5 bg-table-head">
          <span className="text-white font-semibold text-[13.5px] flex-1 truncate mr-3.5 tracking-[-0.01em]">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="bg-white/15 border border-white/10 text-white px-3 py-1.5 rounded-lg cursor-pointer text-[13px] font-semibold hover:bg-white/25 transition-colors flex items-center gap-1.5"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
