export default function StepNum({ children, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue text-white',
    green: 'bg-green text-white',
    soft: 'bg-blue-lt text-blue',
  };
  return (
    <div
      className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center font-mono flex-shrink-0 shadow-card ring-2 ring-white ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
