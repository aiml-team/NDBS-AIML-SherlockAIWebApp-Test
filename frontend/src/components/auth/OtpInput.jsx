import { useEffect, useRef } from 'react';

export default function OtpInput({ value, onChange, onComplete, length = 6, autoFocus = true }) {
  const refs = useRef([]);

  useEffect(() => {
    if (autoFocus && refs.current[0]) refs.current[0].focus();
  }, [autoFocus]);

  function setDigit(idx, char) {
    const digits = (value + '').padEnd(length, ' ').split('');
    digits[idx] = char;
    const next = digits.join('').replace(/\s/g, '');
    onChange(next.slice(0, length));
    if (char && idx < length - 1) refs.current[idx + 1]?.focus();
    if (next.length === length && /^\d{6}$/.test(next) && onComplete) onComplete(next);
  }

  function handleChange(idx, e) {
    const v = e.target.value.replace(/\D/g, '');
    if (!v) {
      setDigit(idx, '');
      return;
    }
    if (v.length > 1) {
      // pasted multiple digits
      const chars = v.slice(0, length).split('');
      const filled = (value + '').slice(0, idx) + chars.join('');
      onChange(filled.slice(0, length));
      const focusIdx = Math.min(idx + chars.length, length - 1);
      refs.current[focusIdx]?.focus();
      if (filled.length === length && onComplete) onComplete(filled);
      return;
    }
    setDigit(idx, v[0]);
  }

  function handleKey(idx, e) {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      refs.current[idx + 1]?.focus();
    }
  }

  function handlePaste(e) {
    const text = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, length);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    refs.current[Math.min(text.length, length - 1)]?.focus();
    if (text.length === length && onComplete) onComplete(text);
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          value={value[i] || ''}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKey(i, e)}
          className="w-11 h-12 sm:w-12 sm:h-14 text-center text-[18px] font-bold font-mono border border-bd rounded-xl bg-white text-ink outline-none transition-all focus:border-blue focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)]"
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
