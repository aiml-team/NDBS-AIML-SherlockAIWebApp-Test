import { useNavigate } from 'react-router-dom';
import { formatRelative, formatDateTime } from '../../lib/format.js';
import StageSelect from './StageSelect.jsx';
import IndustryBadge from './IndustryBadge.jsx';

export default function ProspectCard({ name, description, lastModified, industry, onIndustryChange, stage, onStageChange, onDelete }) {
  const navigate = useNavigate();
  const goto = () => navigate(`/view-prospect/${encodeURIComponent(name)}`);

  return (
    <div
      onClick={goto}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          goto();
        }
      }}
      role="button"
      tabIndex={0}
      title={`Open ${name}`}
      className="group relative bg-white border border-bd rounded-[14px] shadow-card p-4 flex flex-col gap-2 cursor-pointer transition-all hover:bg-bg hover:-translate-y-px hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40 min-h-[110px]"
    >
      <div className="flex items-start justify-between gap-2 pr-8">
        <div className="text-[14px] font-semibold text-ink truncate min-w-0" title={name}>
          {name}
        </div>
        <IndustryBadge industry={industry} onSet={onIndustryChange} />
      </div>

      <div
        className="text-[12px] text-ink-soft leading-snug min-h-[32px] overflow-hidden"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
        title={description || ''}
      >
        {description || ''}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-1.5 text-[11px] text-ink-soft font-mono whitespace-nowrap"
          title={lastModified ? formatDateTime(lastModified) : ''}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green flex-shrink-0" />
          {formatRelative(lastModified)}
        </div>
        <StageSelect stage={stage} onStageChange={onStageChange} />
      </div>

      <button
        type="button"
        aria-label={`Delete ${name}`}
        title={`Delete ${name}`}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-2 right-2 w-7 h-7 rounded-lg text-ink-soft border border-bd bg-white opacity-0 group-hover:opacity-100 transition-all hover:text-red hover:border-red-mid hover:bg-red-lt cursor-pointer flex items-center justify-center"
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
          <path d="M6 1.75A.75.75 0 0 1 6.75 1h2.5a.75.75 0 0 1 .75.75V3h3.25a.75.75 0 0 1 0 1.5h-.563l-.6 8.4A2 2 0 0 1 10.092 15H5.908a2 2 0 0 1-1.995-2.1l-.6-8.4H2.75a.75.75 0 0 1 0-1.5H6V1.75ZM4.819 4.5l.588 8.232a.5.5 0 0 0 .499.518h4.188a.5.5 0 0 0 .499-.518L11.181 4.5H4.819ZM7.5 6.5a.5.5 0 0 1 1 0v5a.5.5 0 0 1-1 0v-5Z" />
        </svg>
      </button>
    </div>
  );
}
