export default function WebSearchToggle({ checked, onChange }) {
  return (
    <label
      title="Use web search to fill in missing fields with public information about the company"
      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl cursor-pointer select-none text-[12px] font-semibold whitespace-nowrap transition-all w-full border ${
        checked
          ? 'border-blue bg-blue-lt text-blue-dark shadow-card'
          : 'border-bd bg-bg3 text-ink-muted hover:border-blue-mid hover:bg-blue-lt hover:text-blue-dark'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="hidden"
      />
      <span
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-blue' : 'bg-bd2'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform ${
            checked ? 'translate-x-[16px]' : ''
          }`}
        />
      </span>
      <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-current flex-shrink-0">
        <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 2c.9 0 2.4 1.6 3.1 4H6.9C7.6 5.6 9.1 4 10 4zm-4.5 6h9c0 .7-.1 1.4-.2 2H5.7c-.1-.6-.2-1.3-.2-2zm.7 4h7.6c-.7 2.4-2.2 4-3.8 4s-3.1-1.6-3.8-4z" />
      </svg>
      <div className="flex-1 min-w-0 leading-tight">
        <div className="text-[12.5px]">Enrich with web research</div>
        <div className="text-[10.5px] font-medium text-current/70 mt-0.5 truncate">
          Fills Section 1 (Customer Overview) using Tavily
        </div>
      </div>
    </label>
  );
}
