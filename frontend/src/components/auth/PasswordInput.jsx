import { useState } from 'react';

function strength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (!pw) return { score: 0, label: '' };
  if (score <= 1) return { score: 1, label: 'Weak', tone: 'bg-red' };
  if (score === 2) return { score: 2, label: 'Okay', tone: 'bg-amber' };
  if (score === 3) return { score: 3, label: 'Good', tone: 'bg-blue' };
  return { score: 4, label: 'Strong', tone: 'bg-green' };
}

export default function PasswordInput({
  value,
  onChange,
  placeholder = 'Password',
  autoComplete = 'current-password',
  showStrength = false,
  hint,
  autoFocus = false,
  onEnter,
}) {
  const [shown, setShown] = useState(false);
  const s = showStrength ? strength(value) : null;

  return (
    <div className="block">
      <div className="relative">
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none">
          <svg viewBox="0 0 20 20" className="w-[18px] h-[18px] fill-current">
            <path d="M10 1a4 4 0 0 0-4 4v3H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1V5a4 4 0 0 0-4-4Zm-2.5 7V5a2.5 2.5 0 0 1 5 0v3h-5ZM10 12.25a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/>
          </svg>
        </span>
        <input
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
          placeholder={placeholder}
          className="w-full pl-12 pr-12 py-3.5 border-2 border-bd rounded-full font-sans text-[14px] text-ink outline-none transition-all bg-white focus:border-blue focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)] placeholder:text-ink-soft"
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          tabIndex={-1}
          className="absolute top-1/2 right-3 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-ink-soft hover:text-ink hover:bg-bg3 cursor-pointer bg-transparent border-none transition-colors"
        >
          {shown ? (
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
              <path d="M2.22 2.22a.75.75 0 0 1 1.06 0l10.5 10.5a.75.75 0 1 1-1.06 1.06l-1.6-1.6A8.8 8.8 0 0 1 8 13c-4 0-6.5-5-6.5-5s.95-1.9 2.74-3.34L2.22 3.28a.75.75 0 0 1 0-1.06ZM5.4 5.4l1.07 1.07a2 2 0 0 0 2.81 2.81l1.07 1.07A4 4 0 0 1 5.4 5.4ZM8 3a8.8 8.8 0 0 1 3.13.59l-1.27 1.27A3.85 3.85 0 0 0 8 4.5 3.5 3.5 0 0 0 4.5 8c0 .38.06.74.17 1.09L3.07 10.6C2.07 9.45 1.5 8 1.5 8S4 3 8 3Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
              <path d="M8 3C4 3 1.5 8 1.5 8S4 13 8 13s6.5-5 6.5-5S12 3 8 3Zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm0-4.5A1.5 1.5 0 1 0 8 9.5 1.5 1.5 0 0 0 8 6.5Z" />
            </svg>
          )}
        </button>
      </div>

      {showStrength && (
        <div className="mt-2.5 ml-5">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  s.score >= i ? s.tone : 'bg-bd'
                }`}
              />
            ))}
          </div>
          {s.label && (
            <p className="text-[11px] text-ink-soft mt-1.5 font-mono uppercase tracking-[0.06em]">
              Strength · <span className="font-bold text-ink-muted">{s.label}</span>
            </p>
          )}
        </div>
      )}

      {hint && <p className="text-[11.5px] text-ink-soft mt-2 ml-5">{hint}</p>}
    </div>
  );
}
