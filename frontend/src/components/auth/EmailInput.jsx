export default function EmailInput({
  value,
  onChange,
  disabled,
  autoFocus = false,
  placeholder = 'Email Address',
  hint,
}) {
  return (
    <div className="block">
      <div className="relative">
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none">
          <svg viewBox="0 0 20 20" className="w-[18px] h-[18px] fill-current">
            <path d="M2.5 5.5A2.5 2.5 0 0 1 5 3h10a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 15 17H5a2.5 2.5 0 0 1-2.5-2.5v-9Zm2.5-1a1 1 0 0 0-.97.76l5.97 3.98 5.97-3.98A1 1 0 0 0 15 4.5H5Zm11 2.94-5.45 3.63a1 1 0 0 1-1.1 0L4 6.94V14.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7.44Z"/>
          </svg>
        </span>
        <input
          type="email"
          autoComplete="email"
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-12 pr-5 py-3.5 border-2 border-bd rounded-full font-sans text-[14px] text-ink outline-none transition-all bg-white focus:border-blue focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)] disabled:opacity-60 placeholder:text-ink-soft"
        />
      </div>
      {hint && <p className="text-[11.5px] text-ink-soft mt-2 ml-5">{hint}</p>}
    </div>
  );
}
