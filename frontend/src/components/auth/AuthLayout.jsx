import { Link } from 'react-router-dom';

export default function AuthLayout({ greeting, sub, children, footerNote }) {
  return (
    <div className="h-screen w-screen bg-white overflow-hidden">
      <div className="h-full grid grid-cols-1 lg:grid-cols-2">

        {/* ── LEFT: brand + illustration ────────────────────────────── */}
        <div className="hidden lg:flex relative flex-col bg-white">
          {/* Brand top-left */}
          <Link to="/" className="absolute top-7 left-9 flex items-center gap-3 no-underline z-10">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
              <img src="/sherlock-logo.png" alt="Sherlock AI" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[15px] font-extrabold text-ink tracking-[-0.01em]">Sherlock AI</span>
              <span className="text-[9.5px] uppercase tracking-[0.12em] font-mono text-ink-soft">
                Document Pipeline
              </span>
            </div>
          </Link>

          {/* Centered illustration */}
          <div className="flex-1 flex flex-col items-center justify-center px-12">
            <img
              src="/auth-illustration.svg"
              alt=""
              aria-hidden="true"
              className="w-full max-w-[460px] mb-7"
            />
            <h2 className="text-[20px] font-extrabold text-ink mb-1 tracking-[-0.01em]">
              Turn transcripts into Discovery Profiles.
            </h2>
            <p className="text-[13.5px] text-ink-muted text-center max-w-[380px] leading-relaxed">
              Upload meeting recordings or docs — the pipeline does the rest, end-to-end.
            </p>
          </div>

          {/* Footer credit */}
          <div className="px-9 pb-6 text-[11px] font-mono text-ink-soft">
            © Sherlock AI · NTT DATA Business Solutions
          </div>
        </div>

        {/* ── RIGHT: gradient panel with floating white card ─────────── */}
        <div className="relative bg-hero-gradient flex items-center justify-center px-5 sm:px-8 py-10 overflow-hidden">
          {/* Subtle noise texture so the gradient doesn't read as a flat fill */}
          <div className="absolute inset-0 bg-hero-noise pointer-events-none" />
          {/* Decorative concentric arcs bottom-right */}
          <svg
            aria-hidden="true"
            viewBox="0 0 400 400"
            className="absolute -bottom-24 -right-24 w-[420px] h-[420px] opacity-25"
            fill="none"
          >
            <circle cx="320" cy="320" r="240" stroke="white" strokeWidth="1.5" />
            <circle cx="320" cy="320" r="190" stroke="white" strokeWidth="1.5" />
            <circle cx="320" cy="320" r="140" stroke="white" strokeWidth="1.5" />
          </svg>

          {/* Small mobile-only brand (top of right panel on lg:hidden) */}
          <Link
            to="/"
            className="lg:hidden absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2 text-white no-underline"
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/15 flex items-center justify-center">
              <img src="/sherlock-logo.png" alt="" className="w-full h-full object-contain" />
            </div>
            <span className="text-[14px] font-extrabold tracking-[-0.01em]">Sherlock AI</span>
          </Link>

          {/* White card */}
          <div className="relative bg-white rounded-[28px] shadow-modal w-full max-w-[440px] p-7 sm:p-10 page-fade">
            <h1 className="text-[32px] sm:text-[36px] font-extrabold text-ink tracking-[-0.02em] leading-none mb-2">
              {greeting}
            </h1>
            {sub && (
              <p className="text-[15px] text-ink-muted mb-6 leading-snug">{sub}</p>
            )}
            {children}
            {footerNote && (
              <div className="text-[13px] text-ink-muted mt-5">{footerNote}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
