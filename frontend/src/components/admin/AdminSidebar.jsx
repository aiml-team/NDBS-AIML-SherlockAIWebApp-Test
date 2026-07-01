import { NavLink } from 'react-router-dom';
import { useAdminCounts } from './AdminCountsContext.jsx';

const ITEMS = [
  {
    to: '/admin/users', label: 'Users', enabled: true,
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM5 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path d="M0 14c0-2.761 2.239-5 5-5M16 14c0-2.761-2.239-5-5-5a4.99 4.99 0 0 0-5 5" />
      </svg>
    ),
  },
  {
    to: '/admin/feedback', label: 'Feedback', enabled: true, countKey: 'unreadFeedback',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h9A1.5 1.5 0 0 1 14 2.5v6A1.5 1.5 0 0 1 12.5 10H9l-3 3v-3H3.5A1.5 1.5 0 0 1 2 8.5v-6Z" />
      </svg>
    ),
  },
  {
    to: '/admin/prospects', label: 'Prospects', enabled: false, badge: 'Phase 2',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 4a1 1 0 0 1 1-1h3.5L8 5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z" />
      </svg>
    ),
  },
  {
    to: '/admin/jobs', label: 'Jobs', enabled: false, badge: 'Phase 3',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="2.5" />
        <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
      </svg>
    ),
  },
  {
    to: '/admin/audit', label: 'Audit log', enabled: false, badge: 'Phase 4',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 1.5h8A1.5 1.5 0 0 1 13.5 3v10A1.5 1.5 0 0 1 12 14.5H4A1.5 1.5 0 0 1 2.5 13V3A1.5 1.5 0 0 1 4 1.5Z" />
        <path d="M5 5.5h6M5 8h6M5 10.5h3.5" />
      </svg>
    ),
  },
  {
    to: '/admin/settings', label: 'Settings', enabled: false, badge: 'Phase 5',
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h10M3 8h10M3 13h10" />
        <circle cx="6" cy="3" r="1.5" className="fill-current stroke-none" />
        <circle cx="10" cy="8" r="1.5" className="fill-current stroke-none" />
        <circle cx="6" cy="13" r="1.5" className="fill-current stroke-none" />
      </svg>
    ),
  },
];

export default function AdminSidebar() {
  const counts = useAdminCounts();

  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-bd bg-white/40 hidden md:flex flex-col">
      <div className="px-4 pt-6 pb-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-soft font-mono">
          Admin panel
        </div>
      </div>
      <nav className="flex flex-col gap-0.5 px-2">
        {ITEMS.map((item) => {
          if (!item.enabled) {
            return (
              <div
                key={item.to}
                aria-disabled="true"
                title="Coming in a future phase"
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-ink-soft/70 cursor-not-allowed select-none"
              >
                <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center opacity-60">{item.icon}</span>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-bg3 text-ink-soft">
                    {item.badge}
                  </span>
                )}
              </div>
            );
          }
          const count = item.countKey ? counts?.[item.countKey] : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold no-underline transition-colors ${
                  isActive
                    ? 'bg-blue-lt text-blue-dark'
                    : 'text-ink-muted hover:bg-bg3 hover:text-ink'
                }`
              }
            >
              <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {count > 0 && (
                <span
                  className="text-[10.5px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-blue text-white min-w-[18px] text-center leading-none"
                  aria-label={`${count} new`}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
