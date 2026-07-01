import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as api from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const u = await api.getMe();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value = {
    user,
    loading,
    isAuthed: !!user,
    refresh,
    async login(email, password) {
      const res = await api.login(email, password);
      setUser(res.user);
      return res.user;
    },
    async signupRequest(email, password) {
      return api.signupRequest(email, password);
    },
    async signupVerify(email, otp) {
      const res = await api.signupVerify(email, otp);
      setUser(res.user);
      return res.user;
    },
    async forgotPassword(email) {
      return api.forgotPassword(email);
    },
    async resetPassword(email, otp, password) {
      const res = await api.resetPassword(email, otp, password);
      setUser(res.user);
      return res.user;
    },
    async logout() {
      try { await api.logout(); } catch { /* ignore */ }
      setUser(null);
    },
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>');
  return ctx;
}
