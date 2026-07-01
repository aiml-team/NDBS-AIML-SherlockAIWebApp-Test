export const INDUSTRIES = [
  {
    key: 'all',
    label: 'All',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M1.5 8h13M8 1.5a9.5 9.5 0 0 1 2.5 6.5A9.5 9.5 0 0 1 8 14.5 9.5 9.5 0 0 1 5.5 8 9.5 9.5 0 0 1 8 1.5Z" />
      </svg>
    ),
  },
  {
    key: 'chemical',
    label: 'Chemical',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2v5L2.5 13.5h11L10 7V2" />
        <path d="M5.5 2h5" />
        <circle cx="5.5" cy="11" r="0.8" className="fill-current" />
        <circle cx="10" cy="12" r="0.8" className="fill-current" />
      </svg>
    ),
  },
  {
    key: 'consumer_goods',
    label: 'Consumer Goods',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 2.5h1.5l1.5 6h6l1.5-4H5" />
        <circle cx="6.5" cy="12.5" r="1" />
        <circle cx="11.5" cy="12.5" r="1" />
      </svg>
    ),
  },
  {
    key: 'life_sciences',
    label: 'Life Sciences',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="1.5" width="4" height="6" rx="2" />
        <path d="M5 7.5h6v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5Z" />
        <path d="M5 10h6" />
      </svg>
    ),
  },
  {
    key: 'manufacturing',
    label: 'Manufacturing',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 13V7l3-3v3l3-3v3l3-3v9H1.5Z" />
        <path d="M10.5 13V9.5l4-2.5V13h-4Z" />
        <path d="M1.5 13h13" />
      </svg>
    ),
  },
  {
    key: 'professional_services',
    label: 'Prof. Services',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="12" height="9" rx="1.5" />
        <path d="M5.5 5V3.5a2.5 2.5 0 0 1 5 0V5" />
        <path d="M8 9v2M7 10h2" />
      </svg>
    ),
  },
  {
    key: 'wholesale_distribution',
    label: 'Wholesale Dist.',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1.5" y="6" width="13" height="8" rx="1" />
        <path d="M4.5 6V4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2" />
        <path d="M1.5 10h13" />
        <path d="M6 10v4M10 10v4" />
      </svg>
    ),
  },
  {
    key: 'other',
    label: 'Other',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 4a1 1 0 0 1 1-1h3.5L8 5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z" />
      </svg>
    ),
  },
];


export default function IndustrySidebar({ selected, onChange, counts }) {
  return (
    <aside className="w-[168px] flex-shrink-0 flex flex-col gap-0.5 overflow-y-auto scrollbar-thin">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft font-mono px-2 mb-1.5">
        Industry
      </div>
      {INDUSTRIES.map((ind) => {
        const count = counts?.[ind.key] ?? 0;
        const isActive = selected === ind.key;
        if (ind.key !== 'all' && count === 0) return null;
        return (
          <button
            key={ind.key}
            type="button"
            onClick={() => onChange(ind.key)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold border-none cursor-pointer transition-colors text-left ${
              isActive
                ? 'bg-blue text-white shadow-sm'
                : 'bg-transparent text-ink-muted hover:bg-bg3 hover:text-ink'
            }`}
          >
            <span className={`w-4 h-4 flex-shrink-0 flex items-center justify-center ${isActive ? 'text-white' : 'text-ink-soft'}`}>
              {ind.icon}
            </span>
            <span className="flex-1 truncate">{ind.label}</span>
            <span className={`text-[10.5px] font-mono tabular-nums flex-shrink-0 ${isActive ? 'text-white/80' : 'text-ink-soft'}`}>
              {ind.key === 'all' ? (counts?._total ?? 0) : count}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
