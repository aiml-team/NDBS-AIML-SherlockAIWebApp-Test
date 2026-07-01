import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../ui/Toast.jsx';

function FullPageSpinner() {
  return (
    <div className="h-screen flex items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue animate-bounce-dot" />
          <span className="w-2 h-2 rounded-full bg-blue animate-bounce-dot [animation-delay:0.2s]" />
          <span className="w-2 h-2 rounded-full bg-blue animate-bounce-dot [animation-delay:0.4s]" />
        </div>
        <span className="text-[11px] font-mono uppercase tracking-[0.15em] text-ink-soft">
          Loading
        </span>
      </div>
    </div>
  );
}

export default function RequireAdmin({ children }) {
  const { user, isAuthed, loading } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const notified = useRef(false);

  const isAdmin = !!user?.is_admin;

  useEffect(() => {
    if (!loading && isAuthed && !isAdmin && !notified.current) {
      notified.current = true;
      toast.error('Admin access required');
    }
  }, [loading, isAuthed, isAdmin, toast]);

  if (loading) return <FullPageSpinner />;
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
}
