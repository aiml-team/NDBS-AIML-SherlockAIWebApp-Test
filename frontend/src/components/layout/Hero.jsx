export default function Hero({
  eyebrow,
  title,
  sub,
  trailing,
  compact = false,
  variant = 'classic',
}) {
  const py = compact ? 'py-4 sm:py-5' : 'py-7 sm:py-9';

  // ── Classic (original) ────────────────────────────────────────────
  if (variant === 'classic') {
    return (
      <div className={`bg-hero-gradient relative overflow-hidden px-4 sm:px-10 ${py}`}>
        <div className="absolute inset-0 bg-hero-noise pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-px bg-white/20 pointer-events-none" />
        <div className="relative w-full">
          {eyebrow && !compact && (
            <div className="inline-flex items-center gap-2 bg-white/12 border border-white/20 text-white/95 text-[10.5px] font-semibold tracking-[0.12em] uppercase px-3 py-[5px] rounded-[20px] mb-2 font-mono backdrop-blur-sm">
              <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4" /></svg>
              {eyebrow}
            </div>
          )}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className={`${compact ? 'text-[18px] sm:text-[22px]' : 'text-[22px] sm:text-[26px]'} font-extrabold text-white leading-tight tracking-[-0.022em] mb-1 truncate max-w-[700px]`}>{title}</h1>
              {sub && <p className={`${compact ? 'text-[12px]' : 'text-[13px]'} text-white/80 leading-[1.6]`}>{sub}</p>}
            </div>
            {trailing && <div className="flex items-center gap-2">{trailing}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ── Modern ────────────────────────────────────────────────────────
  if (variant === 'modern') {
    return (
      <div className={`relative overflow-hidden px-4 sm:px-10 ${py}`} style={{ background: 'linear-gradient(120deg, #1a2f6e 0%, #1d4ed8 55%, #3b82f6 100%)' }}>
        <div className="absolute -top-10 right-[10%] w-56 h-56 rounded-full bg-white/8 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 right-[30%] w-40 h-40 rounded-full bg-blue-300/20 blur-2xl pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-px bg-white/25 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />
        <div className="relative w-full">
          {eyebrow && !compact && (
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-white/90 text-[10.5px] font-semibold tracking-[0.12em] uppercase px-3 py-[5px] rounded-[20px] mb-2.5 font-mono">
              <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4" /></svg>
              {eyebrow}
            </div>
          )}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className={`${compact ? 'text-[20px] sm:text-[24px]' : 'text-[24px] sm:text-[28px]'} font-extrabold text-white leading-tight tracking-[-0.025em] mb-1 truncate max-w-[700px]`}>{title}</h1>
              {sub && <p className={`${compact ? 'text-[12px]' : 'text-[13px]'} text-white/85 leading-[1.6]`}>{sub}</p>}
            </div>
            {trailing && <div className="flex items-center gap-2">{trailing}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ── Aurora (navy → indigo → violet → blue, glowing orbs) ─────────
  if (variant === 'aurora') {
    return (
      <div className={`relative overflow-hidden px-4 sm:px-10 ${py}`} style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 30%, #1d4ed8 65%, #2563eb 100%)' }}>
        {/* Colour orbs */}
        <div className="absolute -top-12 right-[8%]  w-64 h-64 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-16 left-[20%] w-56 h-56 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.30) 0%, transparent 70%)' }} />
        <div className="absolute top-0 right-[40%] w-96 h-full rounded-full pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />
        {/* Edge lines */}
        <div className="absolute inset-x-0 top-0 h-px bg-white/15 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-white/10 pointer-events-none" />
        <div className="relative w-full">
          {eyebrow && !compact && (
            <div className="inline-flex items-center gap-2 bg-white/10 border border-purple-300/30 text-white/90 text-[10.5px] font-semibold tracking-[0.12em] uppercase px-3 py-[5px] rounded-[20px] mb-2.5 font-mono">
              <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4" /></svg>
              {eyebrow}
            </div>
          )}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className={`${compact ? 'text-[20px] sm:text-[24px]' : 'text-[24px] sm:text-[28px]'} font-extrabold text-white leading-tight tracking-[-0.025em] mb-1 truncate max-w-[700px]`}>{title}</h1>
              {sub && <p className={`${compact ? 'text-[12px]' : 'text-[13px]'} text-white/80 leading-[1.6]`}>{sub}</p>}
            </div>
            {trailing && <div className="flex items-center gap-2">{trailing}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ── Midnight (near-black + blue left accent bar) ──────────────────
  if (variant === 'midnight') {
    return (
      <div className={`relative overflow-hidden px-4 sm:px-10 ${py}`} style={{ background: '#0f172a' }}>
        {/* Subtle horizontal scan lines */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(255,255,255,0.018) 24px, rgba(255,255,255,0.018) 25px)' }} />
        {/* Faint blue glow centre-left */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-80 h-32 pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(37,99,235,0.18) 0%, transparent 70%)' }} />
        <div className="absolute inset-x-0 bottom-0 h-px bg-blue/30 pointer-events-none" />
        <div className="relative w-full">
          {eyebrow && !compact && (
            <div className="inline-flex items-center gap-2 bg-blue/15 border border-blue/30 text-blue-300 text-[10.5px] font-semibold tracking-[0.12em] uppercase px-3 py-[5px] rounded-[20px] mb-2.5 font-mono">
              <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4" /></svg>
              {eyebrow}
            </div>
          )}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0 border-l-[3px] border-blue pl-4">
              <h1 className={`${compact ? 'text-[20px] sm:text-[24px]' : 'text-[24px] sm:text-[28px]'} font-extrabold text-white leading-tight tracking-[-0.025em] mb-1 truncate max-w-[700px]`}>{title}</h1>
              {sub && <p className={`${compact ? 'text-[12px]' : 'text-[13px]'} text-slate-400 leading-[1.6]`}>{sub}</p>}
            </div>
            {trailing && <div className="flex items-center gap-2">{trailing}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ── Slate (dark charcoal, no blue) ───────────────────────────────
  if (variant === 'slate') {
    return (
      <div className={`relative overflow-hidden px-4 sm:px-10 ${py}`} style={{ background: 'linear-gradient(120deg, #1e293b 0%, #334155 100%)' }}>
        <div className="absolute inset-x-0 bottom-0 h-px bg-white/10 pointer-events-none" />
        <div className="relative w-full">
          {eyebrow && !compact && (
            <div className="inline-flex items-center gap-2 bg-white/8 border border-white/15 text-white/80 text-[10.5px] font-semibold tracking-[0.12em] uppercase px-3 py-[5px] rounded-[20px] mb-2.5 font-mono">
              <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4" /></svg>
              {eyebrow}
            </div>
          )}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className={`${compact ? 'text-[20px] sm:text-[24px]' : 'text-[24px] sm:text-[28px]'} font-extrabold text-white leading-tight tracking-[-0.025em] mb-1 truncate max-w-[700px]`}>{title}</h1>
              {sub && <p className={`${compact ? 'text-[12px]' : 'text-[13px]'} text-slate-400 leading-[1.6]`}>{sub}</p>}
            </div>
            {trailing && <div className="flex items-center gap-2">{trailing}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ── Blank (white, dark text) ──────────────────────────────────────
  if (variant === 'blank') {
    return (
      <div className={`relative bg-white border-b border-bd px-4 sm:px-10 ${py}`}>
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-blue/40 to-transparent pointer-events-none" />
        <div className="relative w-full">
          {eyebrow && !compact && (
            <div className="inline-flex items-center gap-2 bg-blue-lt border border-blue-mid text-blue text-[10.5px] font-semibold tracking-[0.12em] uppercase px-3 py-[5px] rounded-[20px] mb-2.5 font-mono">
              <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4" /></svg>
              {eyebrow}
            </div>
          )}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className={`${compact ? 'text-[20px] sm:text-[24px]' : 'text-[24px] sm:text-[28px]'} font-extrabold text-ink leading-tight tracking-[-0.025em] mb-1 truncate max-w-[700px]`}>{title}</h1>
              {sub && <p className={`${compact ? 'text-[12px]' : 'text-[13px]'} text-ink-muted leading-[1.6]`}>{sub}</p>}
            </div>
            {trailing && <div className="flex items-center gap-2">{trailing}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ── Frosted glass (gradient bg + glass content card) ─────────────
  return (
    <div className={`relative overflow-hidden px-4 sm:px-10 ${py}`} style={{ background: 'linear-gradient(135deg, #0f1f5c 0%, #1d4ed8 50%, #1e40af 100%)' }}>
      {/* Background depth layers */}
      <div className="absolute -top-8 -right-8 w-72 h-72 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(96,165,250,0.20) 0%, transparent 65%)' }} />
      <div className="absolute -bottom-12 left-[10%] w-48 h-48 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)' }} />
      <div className="absolute inset-x-0 top-0 h-px bg-white/20 pointer-events-none" />
      {/* Glass card wrapping the content */}
      <div className="relative rounded-2xl bg-white/8 border border-white/15 backdrop-blur-sm px-5 py-3.5 w-full" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)' }}>
        {eyebrow && !compact && (
          <div className="inline-flex items-center gap-2 bg-white/12 border border-white/25 text-white/90 text-[10.5px] font-semibold tracking-[0.12em] uppercase px-3 py-[5px] rounded-[20px] mb-2.5 font-mono">
            <svg width="7" height="7" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4" /></svg>
            {eyebrow}
          </div>
        )}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className={`${compact ? 'text-[20px] sm:text-[24px]' : 'text-[24px] sm:text-[28px]'} font-extrabold text-white leading-tight tracking-[-0.025em] mb-1 truncate max-w-[700px]`}>{title}</h1>
            {sub && <p className={`${compact ? 'text-[12px]' : 'text-[13px]'} text-white/80 leading-[1.6]`}>{sub}</p>}
          </div>
          {trailing && <div className="flex items-center gap-2">{trailing}</div>}
        </div>
      </div>
    </div>
  );
}

