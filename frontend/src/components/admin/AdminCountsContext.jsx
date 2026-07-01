import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { adminApi } from '../../lib/api.js';

const Ctx = createContext({
  unreadFeedback: 0,
  refresh: () => {},
});

const POLL_MS = 30000;

export function AdminCountsProvider({ children }) {
  const [unreadFeedback, setUnreadFeedback] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await adminApi.feedbackUnreadCount();
      setUnreadFeedback(Number(res?.count) || 0);
    } catch {
      // Silent — the badge just won't update.
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <Ctx.Provider value={{ unreadFeedback, refresh }}>{children}</Ctx.Provider>
  );
}

export function useAdminCounts() {
  return useContext(Ctx);
}
