import { useEffect, useState } from 'react';

/**
 * Returns the number of seconds remaining until `targetTs` (epoch ms).
 * Updates every second. When `targetTs` is null, the hook is dormant.
 */
export default function useCountdown(targetTs) {
  const [remaining, setRemaining] = useState(() =>
    targetTs ? Math.max(0, Math.round((targetTs - Date.now()) / 1000)) : 0,
  );

  useEffect(() => {
    if (!targetTs) {
      setRemaining(0);
      return undefined;
    }
    function tick() {
      const r = Math.max(0, Math.round((targetTs - Date.now()) / 1000));
      setRemaining(r);
      return r;
    }
    tick();
    const id = setInterval(() => {
      if (tick() <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [targetTs]);

  return remaining;
}

export function formatMmSs(seconds) {
  if (seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
