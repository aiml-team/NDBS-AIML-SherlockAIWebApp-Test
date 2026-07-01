import { useEffect, useState } from 'react';
import StarRating from './StarRating.jsx';
import TagChips from './TagChips.jsx';
import ScreenshotDropzone from './ScreenshotDropzone.jsx';

const MAX_LEN = 4000;

export default function FeedbackModal({ open, onClose, onSubmit, busy, submitterEmail }) {
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(null);
  const [tag, setTag] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [serverError, setServerError] = useState('');

  // Reset form whenever modal closes
  useEffect(() => {
    if (!open) {
      setMessage('');
      setRating(null);
      setTag(null);
      setScreenshot(null);
      setServerError('');
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, busy]);

  if (!open) return null;

  const trimmed = message.trim();
  const tooLong = message.length > MAX_LEN;
  const canSubmit = trimmed.length > 0 && !tooLong && !busy;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setServerError('');
    try {
      await onSubmit({ message: trimmed, rating, tag, screenshot });
    } catch (err) {
      setServerError(err.message || 'Could not send feedback');
    }
  }

  return (
    <div
      className="fixed inset-0 bg-ink/55 backdrop-blur-sm z-[1000] flex items-center justify-center p-5 animate-pop-in"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-modal w-full max-w-[560px] max-h-[92vh] overflow-y-auto border border-bd/50"
      >
        <div className="px-6 pt-5 pb-3 border-b border-bd">
          <h3 className="text-[15px] font-bold text-ink">Send feedback</h3>
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            Tell us what&apos;s working, what&apos;s broken, or what you&apos;d like to see next.
          </p>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Message */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono">
              Your message
            </span>
            <div className="relative">
              <textarea
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={busy}
                autoFocus
                placeholder="What&apos;s on your mind?"
                className={`w-full px-3 py-2.5 rounded-lg border bg-white text-[13.5px] text-ink resize-y focus:outline-none focus:ring-2 ${
                  tooLong
                    ? 'border-red-mid focus:border-red focus:ring-red-lt'
                    : 'border-bd focus:border-blue-mid focus:ring-blue-lt'
                }`}
              />
              <div
                className={`absolute bottom-2 right-3 text-[10.5px] font-mono tabular-nums ${
                  tooLong ? 'text-red' : 'text-ink-soft'
                }`}
              >
                {message.length} / {MAX_LEN}
              </div>
            </div>
          </label>

          {/* Rating */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono">
              How would you rate it?
            </span>
            <StarRating value={rating} onChange={setRating} />
          </div>

          {/* Tag */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono">
              Category <span className="text-ink-soft/70 font-normal normal-case tracking-normal">(optional)</span>
            </span>
            <TagChips value={tag} onChange={setTag} />
          </div>

          {/* Screenshot */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono">
              Screenshot <span className="text-ink-soft/70 font-normal normal-case tracking-normal">(optional)</span>
            </span>
            <ScreenshotDropzone value={screenshot} onChange={setScreenshot} active={open} />
          </div>

          {submitterEmail && (
            <div className="text-[11.5px] text-ink-soft">
              Submitting as <span className="font-semibold text-ink-muted">{submitterEmail}</span>
            </div>
          )}

          {serverError && (
            <div className="text-[12.5px] text-red bg-red-lt border border-red-mid rounded-lg px-3 py-2">
              {serverError}
            </div>
          )}
        </div>

        <div className="bg-bg px-6 py-3.5 flex justify-end gap-2 border-t border-bd sticky bottom-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold text-ink-muted bg-white border border-bd hover:bg-bg3 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-blue text-white hover:opacity-90 cursor-pointer transition-all border-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Sending…' : 'Send feedback'}
          </button>
        </div>
      </form>
    </div>
  );
}
