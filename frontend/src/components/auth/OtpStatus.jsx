import useCountdown, { formatMmSs } from '../../hooks/useCountdown.js';

export default function OtpStatus({
  expiresAt,
  resendAt,
  onResend,
  resending = false,
}) {
  const expSec = useCountdown(expiresAt);
  const resendSec = useCountdown(resendAt);

  const expired = expSec <= 0;
  const lowTime = !expired && expSec < 60;
  const canResend = resendSec <= 0 && !resending;

  return (
    <div className="flex items-center justify-between text-[11.5px] font-mono">
      <span
        className={`inline-flex items-center gap-1.5 ${
          expired ? 'text-red' : lowTime ? 'text-amber-dark' : 'text-ink-soft'
        }`}
        title={expired ? 'Code expired — request a new one' : 'Time remaining on this code'}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            expired ? 'bg-red' : lowTime ? 'bg-amber' : 'bg-green'
          } ${!expired ? 'animate-pulse' : ''}`}
        />
        {expired ? 'Code expired' : `Expires in ${formatMmSs(expSec)}`}
      </span>

      <button
        type="button"
        onClick={onResend}
        disabled={!canResend}
        className={`font-semibold transition-colors bg-transparent border-none p-0 cursor-pointer ${
          canResend ? 'text-blue hover:underline' : 'text-ink-soft cursor-not-allowed'
        }`}
      >
        {resending
          ? 'Sending…'
          : resendSec > 0
          ? `Resend in ${resendSec}s`
          : 'Resend code'}
      </button>
    </div>
  );
}
