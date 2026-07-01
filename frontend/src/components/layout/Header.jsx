import { Link, useLocation } from 'react-router-dom';

export default function Header({ breadcrumb, rightSlot }) {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <header className="glass border-b border-bd/80 px-4 sm:px-8 h-16 flex items-center justify-between sticky top-0 z-[200]">
      {/* ── Brand + breadcrumb ────────────────────────── */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Link
          to="/"
          className="flex items-center gap-3 no-underline flex-shrink-0"
          aria-label="Sherlock AI — go to Dashboard"
        >
          <div className="w-10 h-10 flex items-center justify-center">
            <img
              src="/sherlock-logo.png"
              alt=""
              aria-hidden="true"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[20px] font-extrabold text-ink tracking-[-0.02em]">
              Sherlock AI
            </span>
            {isHome && (
              <span
                className="w-2 h-2 rounded-full bg-blue"
                aria-hidden="true"
                title="You are on the Dashboard"
              />
            )}
          </div>
        </Link>

        {breadcrumb && breadcrumb.length > 0 && (
          <Breadcrumb items={breadcrumb} />
        )}
      </div>

      {/* ── Right cluster ─────────────────────────────── */}
      <div className="flex items-center gap-4 flex-shrink-0">
        {rightSlot}
        <img
          src="/Logo-NTT.png"
          alt="NTT DATA"
          className="h-10 hidden sm:block"
        />
      </div>
    </header>
  );
}

function Breadcrumb({ items }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden sm:flex items-center gap-2 min-w-0"
    >
      <Separator />
      {items.map((crumb, i) => {
        const last = i === items.length - 1;
        return (
          <div key={i} className="flex items-center gap-2 min-w-0">
            {crumb.to && !last ? (
              <Link
                to={crumb.to}
                className="text-[13px] font-semibold text-ink-muted hover:text-blue no-underline transition-colors truncate"
                title={crumb.label}
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className="text-[13px] font-semibold text-ink truncate max-w-[260px]"
                title={crumb.label}
                aria-current={last ? 'page' : undefined}
              >
                {crumb.label}
              </span>
            )}
            {!last && <Separator />}
          </div>
        );
      })}
    </nav>
  );
}

function Separator() {
  return (
    <span
      aria-hidden="true"
      className="text-ink-soft text-base font-light select-none"
    >
      /
    </span>
  );
}
