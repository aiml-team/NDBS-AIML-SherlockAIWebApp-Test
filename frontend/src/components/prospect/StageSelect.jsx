import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { STAGES } from './stages.js';

export default function StageSelect({ stage, onStageChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const dropRef = useRef(null);

  function handleToggle() {
    if (!open) {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) {
        setPos({ top: rect.bottom + 6, left: rect.left });
      }
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e) {
      if (
        !btnRef.current?.contains(e.target) &&
        !dropRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    function onScroll() { setOpen(false); }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const current = STAGES.find((s) => s.key === stage) || null;

  return (
    <div
      className="relative flex-shrink-0"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className={`flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
          current
            ? current.color
            : 'bg-bg3 text-ink-soft border-bd hover:border-bd2 hover:text-ink-muted'
        }`}
      >
        {current && (
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${current.dot}`} />
        )}
        <span>{current ? current.label : 'Set stage'}</span>
        <svg viewBox="0 0 10 10" className="w-2 h-2 flex-shrink-0 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[9999] bg-white border border-bd rounded-xl shadow-soft py-1 min-w-[120px] animate-pop-in"
          onClick={(e) => e.stopPropagation()}
        >
          {STAGES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => { onStageChange(s.key); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] cursor-pointer border-none bg-transparent transition-colors text-left hover:bg-bg3 ${
                s.key === stage ? 'font-semibold text-ink' : 'font-normal text-ink-muted'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
              {s.label}
            </button>
          ))}
          {stage && (
            <>
              <div className="mx-2 my-1 h-px bg-bd" />
              <button
                type="button"
                onClick={() => { onStageChange(null); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[12.5px] cursor-pointer border-none bg-transparent text-ink-soft hover:bg-bg3 transition-colors text-left"
              >
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current flex-shrink-0" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
                Clear stage
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
