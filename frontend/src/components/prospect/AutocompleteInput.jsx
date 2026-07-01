import { useEffect, useRef, useState } from 'react';

export default function AutocompleteInput({
  value,
  onChange,
  onSelectExisting,
  onSubmit,
  suggestions = [],
  disabled = false,
  placeholder = 'Enter prospect name…',
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const lower = value.toLowerCase();
  const matches = lower
    ? suggestions.filter((p) => p.prospect_name.toLowerCase().includes(lower))
    : [];

  return (
    <div ref={wrapRef} className="flex-1 relative">
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="w-full px-3.5 py-2.5 border border-bd rounded-[10px] font-sans text-sm text-ink outline-none transition-all bg-white disabled:opacity-60 focus:border-blue focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)] placeholder:text-ink-soft"
      />
      {open && matches.length > 0 && (
        <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-white border border-bd rounded-[10px] shadow-soft max-h-60 overflow-y-auto z-50">
          {matches.map((p) => (
            <div
              key={p.prospect_name}
              onClick={() => {
                onSelectExisting(p.prospect_name);
                setOpen(false);
              }}
              className="px-3.5 py-2.5 border-b border-bd last:border-b-0 cursor-pointer text-[13px] transition-colors hover:bg-blue-lt"
            >
              <div className="font-semibold text-ink">{p.prospect_name}</div>
              {p.description && (
                <div className="text-[11px] text-ink-soft mt-0.5">{p.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
