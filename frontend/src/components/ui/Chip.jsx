const variants = {
  blue: 'text-blue border-blue-mid bg-blue-lt',
  teal: 'text-teal border-[#a5f3fc] bg-teal-lt',
};

export default function Chip({ children, variant = 'blue' }) {
  return (
    <span
      className={`text-[10.5px] font-semibold px-2.5 py-1 rounded-[20px] border font-mono tracking-[0.04em] ${variants[variant]}`}
    >
      {children}
    </span>
  );
}
