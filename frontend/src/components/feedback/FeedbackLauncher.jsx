import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import FeedbackButton from './FeedbackButton.jsx';
import FeedbackModal from './FeedbackModal.jsx';
import { submitFeedback } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../ui/Toast.jsx';

export default function FeedbackLauncher() {
  const { user } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Hidden inside the admin panel (admins have their own tools)
  if (location.pathname.startsWith('/admin')) return null;

  async function handleSubmit(payload) {
    setBusy(true);
    try {
      await submitFeedback(payload);
      toast.success('Thanks for the feedback!');
      setOpen(false);
    } catch (err) {
      // Also surface as a toast so it's visible even after the modal closes;
      // re-throw so the modal can show the inline banner.
      toast.error(err.message || 'Could not send feedback');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <FeedbackButton onClick={() => setOpen(true)} hidden={open} />
      <FeedbackModal
        open={open}
        onClose={() => !busy && setOpen(false)}
        onSubmit={handleSubmit}
        busy={busy}
        submitterEmail={user?.email}
      />
    </>
  );
}
