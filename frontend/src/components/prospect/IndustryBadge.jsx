import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { INDUSTRIES } from './IndustrySidebar.jsx';

const COLORS = {
  chemical:               'bg-sky-50 text-sky-700 border-sky-200',
  consumer_goods:         'bg-orange-50 text-orange-700 border-orange-200',
  life_sciences:          'bg-purple-50 text-purple-700 border-purple-200',
  manufacturing:          'bg-blue-lt text-blue-dark border-blue-mid',
  professional_services:  'bg-teal-lt text-teal border-teal/30',
  wholesale_distribution: 'bg-green-lt text-green-dark border-green-mid',
  other:                  'bg-bg3 text-ink-soft border-bd',
};

const LABELS = Object.fromEntries(
  INDUSTRIES.filter((i) => i.key !== 'all').map((i) => [i.key, i.label]),
);

export default function IndustryBadge({ industry, onSet, disabled }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const dropRef = useRef(null);

  function handleToggle(e) {
    e.stopPropagation();
    if (disabled) return;
    if (!open) {
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e) {
      if (!btnRef.current?.contains(e.target) && !dropRef.current?.contains(e.target))
        setOpen(false);
    }
    function onScroll() { setOpen(false); }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const label = LABELS[industry] || null;
  const color = COLORS[industry] || COLORS.other;

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
        title={label ? `Industry: ${label} — click to change` : 'Set industry'}
        disabled={disabled}
        className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] font-mono px-1.5 py-0.5 rounded border transition-colors ${
          disabled ? 'cursor-default opacity-60' : 'cursor-pointer'
        } ${label ? color : 'bg-bg3 text-ink-soft border-bd hover:border-blue-mid hover:text-blue'}`}
      >
        {label || 'Industry?'}
        {!disabled && (
          <svg viewBox="0 0 8 8" className="w-1.5 h-1.5 opacity-50" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 2.5l3 3 3-3" />
          </svg>
        )}
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-[9999] bg-white border border-bd rounded-xl shadow-soft p-1 min-w-[172px] animate-pop-in"
          onClick={(e) => e.stopPropagation()}
        >
          {INDUSTRIES.filter((i) => i.key !== 'all').map((ind) => (
            <button
              key={ind.key}
              type="button"
              onClick={(e) => { e.stopPropagation(); onSet(ind.key); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-left border-none cursor-pointer transition-colors ${
                ind.key === industry
                  ? 'bg-blue text-white'
                  : 'bg-transparent text-ink-muted hover:bg-bg3 hover:text-ink'
              }`}
            >
              <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center">
                {ind.icon}
              </span>
              {ind.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
