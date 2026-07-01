import { useState } from 'react';

const LABELS = ['Terrible', 'Bad', 'OK', 'Good', 'Excellent'];

/** value: number 1..5 or null. onChange(n | null). readOnly renders without interactivity. */
export default function StarRating({ value, onChange, readOnly = false, size = 'md' }) {
  const [hover, setHover] = useState(0);
  const active = hover || value || 0;
  const dimension = size === 'sm' ? 'w-4 h-4' : 'w-6 h-6';
  const padding = size === 'sm' ? 'p-0.5' : 'p-1';

  function clickStar(n) {
    if (readOnly) return;
    // Click the same star again to clear it (so "rating is optional" stays honest)
    onChange?.(value === n ? null : n);
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center"
        onMouseLeave={() => !readOnly && setHover(0)}
        role={readOnly ? 'img' : 'radiogroup'}
        aria-label={readOnly ? `Rated ${value || 0} of 5` : 'Rate your experience'}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= active;
          return (
            <button
              key={n}
              type="button"
              disabled={readOnly}
              onClick={() => clickStar(n)}
              onMouseEnter={() => !readOnly && setHover(n)}
              aria-label={readOnly ? undefined : `${n} star${n > 1 ? 's' : ''}`}
              className={`${padding} bg-transparent border-none ${readOnly ? 'cursor-default' : 'cursor-pointer'} transition-transform ${!readOnly && filled ? 'hover:scale-110' : ''}`}
            >
              <svg
                viewBox="0 0 24 24"
                className={`${dimension} transition-colors ${
                  filled ? 'fill-amber-400' : 'fill-bd'
                }`}
                aria-hidden="true"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </button>
          );
        })}
      </div>
      {!readOnly && (
        <span className="text-[11.5px] text-ink-soft font-mono min-w-[60px]">
          {active > 0 ? LABELS[active - 1] : 'Optional'}
        </span>
      )}
    </div>
  );
}
