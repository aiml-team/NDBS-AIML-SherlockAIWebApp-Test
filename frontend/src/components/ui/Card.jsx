export default function Card({ children, className = '', flex = false }) {
  return (
    <div
      className={`bg-white border border-bd/80 rounded-[14px] shadow-card ${
        flex ? 'flex flex-col flex-1 min-h-0 overflow-hidden' : 'overflow-visible'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHead({ children }) {
  return (
    <div className="px-5 py-3.5 border-b border-bd/80 flex items-center gap-2.5 bg-bg/50 rounded-t-[14px]">
      {children}
    </div>
  );
}

export function CardBody({ children, padded = true, className = '' }) {
  return (
    <div className={`${padded ? 'px-5 py-5' : ''} ${className}`}>{children}</div>
  );
}

export function CardTitle({ children }) {
  return (
    <span className="text-[11.5px] font-bold text-ink-muted uppercase tracking-[0.1em]">
      {children}
    </span>
  );
}
