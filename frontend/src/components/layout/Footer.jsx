import { useEffect, useRef, useState } from 'react';

const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 4_000;
const VERSION = 'v2.0.0';

async function pingApi(signal) {
  // /api/auth/me responds 200 when signed in, 401 when not — both prove the
  // server is reachable. Any thrown error / 5xx means the API is down.
  const base = import.meta.env.VITE_API_BASE || '';
  const res = await fetch(`${base}/api/auth/me`, {
    credentials: 'include',
    signal,
  });
  if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
  return true;
}

function useApiHealth() {
  const [state, setState] = useState({ status: 'pending', checkedAt: null, error: null });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let timer = null;

    async function tick() {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), PING_TIMEOUT_MS);
      try {
        await pingApi(ctl.signal);
        if (mounted.current) {
          setState({ status: 'ok', checkedAt: new Date(), error: null });
        }
      } catch (err) {
        if (mounted.current) {
          setState({
            status: 'down',
            checkedAt: new Date(),
            error: err?.message || 'API unreachable',
          });
        }
      } finally {
        clearTimeout(to);
        if (mounted.current) {
          timer = setTimeout(tick, PING_INTERVAL_MS);
        }
      }
    }

    tick();
    return () => {
      mounted.current = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return state;
}

function statusUi(status) {
  switch (status) {
    case 'ok':
      return {
        dot: 'bg-green',
        ring: 'shadow-[0_0_0_4px_rgba(5,150,105,0.15)]',
        label: 'All systems operational',
        text: 'text-ink-muted',
      };
    case 'down':
      return {
        dot: 'bg-red',
        ring: 'shadow-[0_0_0_4px_rgba(220,38,38,0.15)]',
        label: 'API unreachable',
        text: 'text-red',
      };
    default:
      return {
        dot: 'bg-bd2',
        ring: '',
        label: 'Checking status…',
        text: 'text-ink-soft',
      };
  }
}

export default function Footer() {
  const { status, checkedAt, error } = useApiHealth();
  const ui = statusUi(status);

  const tooltip = (() => {
    const time = checkedAt
      ? checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '—';
    if (status === 'down') return `${error} · checked ${time}`;
    if (status === 'ok') return `Sherlock API reachable · checked ${time}`;
    return 'Checking…';
  })();

  return (
    <footer className="bg-white border-t border-bd px-4 sm:px-8 py-2.5 flex items-center justify-between flex-shrink-0">
      <div
        className="flex items-center gap-2 text-[11.5px] font-medium"
        title={tooltip}
        aria-live="polite"
      >
        <span
          className={`relative inline-block w-2 h-2 rounded-full ${ui.dot} ${ui.ring} ${
            status === 'ok' ? 'animate-pulse' : ''
          }`}
          aria-hidden="true"
        />
        <span className={`${ui.text}`}>{ui.label}</span>
      </div>

      <span className="text-[11px] text-ink-soft font-mono">
        © NTT DATA · {VERSION}
      </span>
    </footer>
  );
}
