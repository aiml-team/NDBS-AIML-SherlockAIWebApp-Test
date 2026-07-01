export default function ProspectBreadcrumb({ name, onChange }) {
  return (
    <div className="flex items-center gap-2 bg-white border border-bd rounded-full pl-1 pr-2 py-1 shadow-card w-fit animate-pop-in">
      <span className="w-7 h-7 rounded-full bg-blue text-white flex items-center justify-center ring-2 ring-white">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.749.749 0 0 1 1.06-1.06L6 10.939l6.72-6.719a.75.75 0 0 1 1.06 0Z" />
        </svg>
      </span>
      <div className="flex flex-col leading-tight pr-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono">
          Prospect
        </span>
        <span className="text-[13px] font-semibold text-ink truncate max-w-[280px]">{name}</span>
      </div>
      {onChange && (
        <button
          type="button"
          onClick={onChange}
          className="text-[11px] font-semibold text-blue px-2.5 py-1 rounded-full hover:bg-blue-lt transition-colors border-none bg-transparent cursor-pointer"
        >
          Change
        </button>
      )}
    </div>
  );
}
