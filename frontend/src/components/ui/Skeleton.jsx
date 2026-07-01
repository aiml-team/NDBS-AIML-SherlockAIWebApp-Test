export default function Skeleton({ className = '', rounded = 'rounded-md' }) {
  return (
    <div className={`bg-bg3 ${rounded} shimmer ${className}`} />
  );
}
