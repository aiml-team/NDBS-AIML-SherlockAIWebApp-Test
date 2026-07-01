export default function BulletPointsToggle({ checked, onChange }) {
  return (
    <label
      title="Format all section content as bullet points instead of prose paragraphs"
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
        <circle cx="3.5" cy="5" r="1.5" />
        <rect x="6.5" y="4" width="10" height="2" rx="1" />
        <circle cx="3.5" cy="10" r="1.5" />
        <rect x="6.5" y="9" width="10" height="2" rx="1" />
        <circle cx="3.5" cy="15" r="1.5" />
        <rect x="6.5" y="14" width="10" height="2" rx="1" />
      </svg>
      <div className="flex-1 min-w-0 leading-tight">
        <div className="text-[12.5px]">Bullet point format</div>
        <div className="text-[10.5px] font-medium text-current/70 mt-0.5 truncate">
          Formats each section as bullet points
        </div>
      </div>
    </label>
  );
}
