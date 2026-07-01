import { useRef } from 'react';

const OPTIONS = ['grid', 'list'];

const ICONS = {
  grid: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
      <path d="M2 2h5v5H2V2zm7 0h5v5H9V2zM2 9h5v5H2V9zm7 0h5v5H9V9z" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
      <path d="M2 3h12v2H2V3zm0 4h12v2H2V7zm0 4h12v2H2v-2z" />
    </svg>
  ),
};

const LABELS = { grid: 'Grid', list: 'List' };

/**
 * Segmented control to switch between 'grid' and 'list' views.
 * Controlled component — caller owns the value.
 *
 * ARIA: toggle-button group (role="group" + aria-pressed per button), as
 * specified in the design doc — each option triggers an action rather than
 * holding a form value. Arrow keys move directionally with wrap; the
 * currently-pressed button is the single tab-stop (roving tabindex).
 */
export default function ViewToggle({ value, onChange }) {
  const refs = useRef({});

  function handleKeyDown(e) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = OPTIONS.indexOf(value);
    const next = OPTIONS[(i + delta + OPTIONS.length) % OPTIONS.length];
    if (next === value) return;
    onChange(next);
    refs.current[next]?.focus();
  }

  const baseBtn =
    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue/40';
  const onBtn = 'bg-ink text-white';
  const offBtn = 'bg-transparent text-ink-soft hover:text-ink';

  return (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex items-center gap-0.5 bg-white border border-bd rounded-[10px] p-0.5"
    >
      {OPTIONS.map((opt) => {
        const pressed = value === opt;
        return (
          <button
            key={opt}
            ref={(el) => { refs.current[opt] = el; }}
            type="button"
            aria-pressed={pressed}
            tabIndex={pressed ? 0 : -1}
            onClick={() => { if (!pressed) onChange(opt); }}
            onKeyDown={handleKeyDown}
            className={`${baseBtn} ${pressed ? onBtn : offBtn}`}
          >
            {ICONS[opt]}
            {LABELS[opt]}
          </button>
        );
      })}
    </div>
  );
}
