import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import FeedbackModal from './FeedbackModal.jsx';
import { submitFeedback } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../ui/Toast.jsx';

/**
 * Feedback provider — mounts the FeedbackModal once at the app root and
 * exposes `useFeedback()` so any component (e.g. the UserMenu dropdown) can
 * open it. The floating FeedbackButton has been retired: the "Send feedback"
 * entry now lives in the profile-icon dropdown so that the bottom-right
 * corner is reserved for the chat widget.
 */
const FeedbackCtx = createContext(null);

export function useFeedback() {
  const ctx = useContext(FeedbackCtx);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}

export function FeedbackProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openFeedback = useCallback(() => setOpen(true), []);
  const closeFeedback = useCallback(() => { if (!busy) setOpen(false); }, [busy]);

  async function handleSubmit(payload) {
    setBusy(true);
    try {
      await submitFeedback(payload);
      toast.success('Thanks for the feedback!');
      setOpen(false);
    } catch (err) {
      toast.error(err.message || 'Could not send feedback');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  const value = useMemo(
    () => ({ openFeedback, isFeedbackOpen: open }),
    [openFeedback, open],
  );

  return (
    <FeedbackCtx.Provider value={value}>
      {children}
      {/* Only mount the modal when the user is signed in — matches the
          previous behaviour of the floating launcher. */}
      {user && (
        <FeedbackModal
          open={open}
          onClose={closeFeedback}
          onSubmit={handleSubmit}
          busy={busy}
          submitterEmail={user?.email}
        />
      )}
    </FeedbackCtx.Provider>
  );
}

// Back-compat default export — mounts nothing on its own so the old
// `<FeedbackLauncher />` call sites become no-ops after the migration.
// The provider is the correct integration point going forward.
export default function FeedbackLauncher() {
  return null;
}
