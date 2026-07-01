const LABELS = {
  1: 'Converting transcript',
  2: 'AI summarising sections',
  3: 'Generating Word document',
};

function StepRow({ n, state }) {
  const tone =
    state === 'done'
      ? 'text-green'
      : state === 'active'
      ? 'text-blue'
      : 'text-ink-soft';

  const icon =
    state === 'done' ? (
      <span className="w-5 h-5 rounded-full bg-green-lt text-green flex items-center justify-center">
        <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.749.749 0 0 1 1.06-1.06L6 10.939l6.72-6.719a.75.75 0 0 1 1.06 0Z" />
        </svg>
      </span>
    ) : state === 'active' ? (
      <span className="w-5 h-5 rounded-full bg-blue-lt text-blue flex items-center justify-center">
        <span className="w-2 h-2 rounded-full bg-blue animate-pulse" />
      </span>
    ) : (
      <span className="w-5 h-5 rounded-full border border-bd2 bg-white" />
    );

  return (
    <div className={`flex items-center gap-2.5 text-[12.5px] font-semibold ${tone}`}>
      {icon}
      <span>
        Step {n} · {LABELS[n]}
      </span>
    </div>
  );
}

export default function ProcessingPanel({ step = 0, status = '', message = '' }) {
  function stateFor(n) {
    if (status === 'done') return 'done';
    if (n < step) return 'done';
    if (n === step) return 'active';
    return 'pending';
  }

  const pct =
    status === 'done'
      ? 100
      : step >= 3
      ? 80
      : step >= 2
      ? 55
      : step >= 1
      ? 25
      : 8;

  return (
    <div className="mt-3 bg-gradient-to-br from-blue-lt to-white border border-blue-mid rounded-2xl px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-dark font-mono">
          Pipeline running
        </span>
        <div className="flex gap-1.5">
          <span className="w-1.5 h-1.5 bg-blue rounded-full animate-bounce-dot" />
          <span className="w-1.5 h-1.5 bg-blue rounded-full animate-bounce-dot [animation-delay:0.2s]" />
          <span className="w-1.5 h-1.5 bg-blue rounded-full animate-bounce-dot [animation-delay:0.4s]" />
        </div>
      </div>

      <div className="h-1.5 bg-white border border-blue-mid rounded-full overflow-hidden mb-3.5">
        <div
          className="h-full bg-gradient-to-r from-blue to-blue-dark transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex flex-col gap-2 mb-2">
        <StepRow n={1} state={stateFor(1)} />
        <StepRow n={2} state={stateFor(2)} />
        <StepRow n={3} state={stateFor(3)} />
      </div>

      {message && (
        <p className="text-[11.5px] text-ink-muted text-center mt-2 font-mono">{message}</p>
      )}
      <p className="text-[11px] text-ink-soft text-center mt-1.5 leading-snug">
        Processing continues on the server — you can safely close this tab.
      </p>
    </div>
  );
}
