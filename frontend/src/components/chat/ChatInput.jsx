import { useRef, useEffect } from 'react';
import Button from '../ui/Button.jsx';

export default function ChatInput({ value, onChange, onSend, disabled }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [value]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  }

  return (
    <div className="border-t border-bd/70 bg-white p-3 sm:p-4">
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Enquire about a prospect…"
          className="flex-1 resize-none rounded-xl border border-bd bg-white px-3 py-2 text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue/60 disabled:opacity-60"
          aria-label="Chat message"
        />
        <Button
          variant="primary"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
        >
          {disabled ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
