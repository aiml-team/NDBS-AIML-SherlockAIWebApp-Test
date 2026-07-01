import { useNavigate } from 'react-router-dom';
import { formatRelative, formatDateTime } from '../../lib/format.js';
import StageSelect from './StageSelect.jsx';
import IndustryBadge from './IndustryBadge.jsx';

export default function ProspectRow({ name, description, lastModified, industry, onIndustryChange, stage, onStageChange, onDelete }) {
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
      className="group grid grid-cols-[1fr_116px_140px_40px] gap-3 px-[22px] py-3.5 border-b border-bd items-center transition-colors hover:bg-bg cursor-pointer last:border-b-0"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-[14px] font-semibold text-ink truncate" title={name}>
            {name}
          </div>
          <IndustryBadge industry={industry} onSet={onIndustryChange} />
        </div>
        {description && (
          <div className="text-[12px] text-ink-soft truncate mt-0.5" title={description}>
            {description}
          </div>
        )}
      </div>

      <div>
        <StageSelect stage={stage} onStageChange={onStageChange} />
      </div>

      <div
        className="text-[12px] text-ink-soft font-mono whitespace-nowrap"
        title={lastModified ? formatDateTime(lastModified) : ''}
      >
        {formatRelative(lastModified)}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          aria-label={`Delete ${name}`}
          title={`Delete ${name}`}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-8 h-8 rounded-lg text-ink-soft border border-bd bg-white opacity-0 group-hover:opacity-100 transition-all hover:text-red hover:border-red-mid hover:bg-red-lt cursor-pointer flex items-center justify-center"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
            <path d="M6 1.75A.75.75 0 0 1 6.75 1h2.5a.75.75 0 0 1 .75.75V3h3.25a.75.75 0 0 1 0 1.5h-.563l-.6 8.4A2 2 0 0 1 10.092 15H5.908a2 2 0 0 1-1.995-2.1l-.6-8.4H2.75a.75.75 0 0 1 0-1.5H6V1.75ZM4.819 4.5l.588 8.232a.5.5 0 0 0 .499.518h4.188a.5.5 0 0 0 .499-.518L11.181 4.5H4.819ZM7.5 6.5a.5.5 0 0 1 1 0v5a.5.5 0 0 1-1 0v-5Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
