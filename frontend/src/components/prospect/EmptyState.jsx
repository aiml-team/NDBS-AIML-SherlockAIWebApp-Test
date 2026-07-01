export default function EmptyState({ icon, message, padding = 'py-16 px-5' }) {
  return (
    <div className={`${padding} text-center text-ink-soft`}>
      {icon && <div className="mx-auto mb-3.5">{icon}</div>}
      <p className="text-sm">{message}</p>
    </div>
  );
}
