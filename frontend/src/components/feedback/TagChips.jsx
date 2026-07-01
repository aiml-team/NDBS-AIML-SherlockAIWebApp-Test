export const FEEDBACK_TAGS = [
  { key: 'excellent', label: 'Excellent', tone: 'green' },
  { key: 'good',      label: 'Good',      tone: 'blue' },
  { key: 'bad',       label: 'Bad',       tone: 'amber' },
  { key: 'confusing', label: 'Confusing', tone: 'red' },
];

const TONES = {
  green: {
    active:   'bg-green text-white border-green',
    inactive: 'bg-white text-ink-muted border-bd hover:border-green-mid hover:bg-green-lt hover:text-green-dark',
    readOnly: 'bg-green-lt text-green-dark border-green-mid',
  },
  blue: {
    active:   'bg-blue text-white border-blue',
    inactive: 'bg-white text-ink-muted border-bd hover:border-blue-mid hover:bg-blue-lt hover:text-blue',
    readOnly: 'bg-blue-lt text-blue-dark border-blue-mid',
  },
  amber: {
    active:   'bg-amber-500 text-white border-amber-500',
    inactive: 'bg-white text-ink-muted border-bd hover:border-amber-400 hover:bg-amber-100 hover:text-amber-800',
    readOnly: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  red: {
    active:   'bg-red text-white border-red',
    inactive: 'bg-white text-ink-muted border-bd hover:border-red-mid hover:bg-red-lt hover:text-red',
    readOnly: 'bg-red-lt text-red border-red-mid',
  },
};

const BASE = 'px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors';

/** Read-only pill rendering of a tag key. */
export function TagPill({ tagKey, size = 'md' }) {
  const tag = FEEDBACK_TAGS.find((t) => t.key === tagKey);
  if (!tag) return null;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10.5px]' : 'px-3 py-1 text-[11.5px]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wider font-mono ${padding} ${TONES[tag.tone].readOnly}`}>
      {tag.label}
    </span>
  );
}

/** Single-select chip group. value: key|null. onChange(key|null). */
export default function TagChips({ value, onChange }) {
  function pick(key) {
    onChange?.(value === key ? null : key);
  }
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Feedback tag">
      {FEEDBACK_TAGS.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => pick(t.key)}
            className={`${BASE} cursor-pointer ${active ? TONES[t.tone].active : TONES[t.tone].inactive}`}
            aria-pressed={active}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
