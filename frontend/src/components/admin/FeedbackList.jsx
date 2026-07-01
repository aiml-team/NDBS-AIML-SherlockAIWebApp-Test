import { useEffect, useState } from 'react';
import Skeleton from '../ui/Skeleton.jsx';
import StarRating from '../feedback/StarRating.jsx';
import { TagPill } from '../feedback/TagChips.jsx';
import { adminApi } from '../../lib/api.js';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function ScreenshotLightbox({ url, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-ink/80 backdrop-blur-sm z-[1100] flex items-center justify-center p-6 animate-pop-in cursor-zoom-out"
      onClick={onClose}
    >
      <img
        src={url}
        alt="Feedback screenshot"
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full rounded-lg shadow-modal border border-white/10 cursor-default"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center border-none cursor-pointer transition-colors backdrop-blur-sm"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" aria-hidden="true">
          <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
    </div>
  );
}

export default function FeedbackList({ items, loading, emptyMessage, onToggleRead, onDelete, busyId }) {
  const [lightboxUrl, setLightboxUrl] = useState('');

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white border border-bd rounded-xl p-5">
            <Skeleton className="h-4 w-48 mb-3" />
            <Skeleton className="h-3 w-full mb-1.5" />
            <Skeleton className="h-3 w-5/6 mb-1.5" />
            <Skeleton className="h-3 w-4/6" />
          </div>
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="bg-white border border-bd rounded-xl p-10 text-center">
        <div className="flex justify-center mb-2">
          <svg viewBox="0 0 24 24" className="w-8 h-8 stroke-ink-soft fill-none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" />
          </svg>
        </div>
        <p className="text-[13px] text-ink-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3 list-none p-0 m-0">
        {items.map((item) => {
          const busy = busyId === item.id;
          const screenshotUrl = item.has_screenshot ? adminApi.feedbackScreenshotUrl(item.id) : '';
          return (
            <li
              key={item.id}
              className={`bg-white border rounded-xl p-5 shadow-soft transition-colors ${
                item.is_read ? 'border-bd' : 'border-blue-mid bg-blue-lt/20'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[13px] font-semibold text-ink break-all">
                    {item.email}
                  </span>
                  {!item.is_read ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider font-mono bg-blue text-white">
                      New
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider font-mono bg-bg3 text-ink-soft">
                      Read
                    </span>
                  )}
                  {item.tag && <TagPill tagKey={item.tag} size="sm" />}
                </div>
                <div className="text-[11.5px] text-ink-soft tabular-nums">
                  {formatDate(item.created_at)}
                </div>
              </div>

              {item.rating != null && (
                <div className="mb-2">
                  <StarRating value={item.rating} readOnly size="sm" />
                </div>
              )}

              <div className="flex gap-3.5 items-start mb-3.5">
                {screenshotUrl && (
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(screenshotUrl)}
                    aria-label="View screenshot"
                    className="flex-shrink-0 w-20 h-20 rounded-lg border border-bd overflow-hidden bg-bg3 cursor-zoom-in p-0 hover:border-blue-mid hover:shadow-soft transition-all"
                  >
                    <img
                      src={screenshotUrl}
                      alt="Screenshot thumbnail"
                      className="w-full h-full object-cover block"
                      loading="lazy"
                    />
                  </button>
                )}
                <p className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap break-words flex-1 min-w-0">
                  {item.message}
                </p>
              </div>

              <div className="flex justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => onToggleRead(item)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-md border border-bd bg-white text-ink-muted hover:border-blue-mid hover:bg-blue-lt hover:text-blue text-[12px] font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {item.is_read ? 'Mark as unread' : 'Mark as read'}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-md border border-bd bg-white text-ink-muted hover:border-red-mid hover:bg-red-lt hover:text-red text-[12px] font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {lightboxUrl && <ScreenshotLightbox url={lightboxUrl} onClose={() => setLightboxUrl('')} />}
    </>
  );
}
