import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import FeedbackLauncher from '../feedback/FeedbackLauncher.jsx';

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

export default function RequireAuth({ children }) {
  const { isAuthed, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return (
    <>
      {children}
      <FeedbackLauncher />
    </>
  );
}

export function RedirectIfAuthed({ children }) {
  const { isAuthed, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (isAuthed) return <Navigate to="/" replace />;
  return children;
}
