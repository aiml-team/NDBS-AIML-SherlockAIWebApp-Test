import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../components/admin/AdminLayout.jsx';
import FeedbackList from '../components/admin/FeedbackList.jsx';
import { useAdminCounts } from '../components/admin/AdminCountsContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { useConfirm } from '../components/ui/Confirm.jsx';
import { adminApi } from '../lib/api.js';
import { FEEDBACK_TAGS } from '../components/feedback/TagChips.jsx';

const PER_PAGE = 25;
const FILTERS = [
  { key: 'all',  label: 'All' },
  { key: 'new',  label: 'New' },
  { key: 'read', label: 'Read' },
];
const TAG_KEYS = FEEDBACK_TAGS.map((t) => t.key);

export default function AdminFeedbackPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const counts = useAdminCounts();

  const rawStatus = params.get('status') || 'all';
  const status = FILTERS.some((f) => f.key === rawStatus) ? rawStatus : 'all';
  const rawTag = params.get('tag') || '';
  const tag = TAG_KEYS.includes(rawTag) ? rawTag : '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);

  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ new: 0, read: 0 });
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await adminApi.listFeedback({ status, tag, page, perPage: PER_PAGE });
      setItems(res.items || []);
      setTotal(res.total || 0);
      setSummary(res.counts || { new: 0, read: 0 });
    } catch (e) {
      setItems([]);
      toast.error(e.message || 'Failed to load feedback');
    }
  }, [status, tag, page, toast]);

  useEffect(() => { load(); }, [load]);

  function setStatus(next) {
    const newParams = new URLSearchParams(params);
    if (next === 'all') newParams.delete('status'); else newParams.set('status', next);
    newParams.delete('page');
    setParams(newParams, { replace: true });
  }

  function setTag(next) {
    const newParams = new URLSearchParams(params);
    if (!next) newParams.delete('tag'); else newParams.set('tag', next);
    newParams.delete('page');
    setParams(newParams, { replace: true });
  }

  function setPage(next) {
    const newParams = new URLSearchParams(params);
    if (next <= 1) newParams.delete('page'); else newParams.set('page', String(next));
    setParams(newParams, { replace: true });
  }

  async function handleToggleRead(item) {
    setBusyId(item.id);
    try {
      await adminApi.setFeedbackRead(item.id, !item.is_read);
      await load();
      counts.refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item) {
    const ok = await confirm({
      tone: 'danger',
      title: 'Delete feedback?',
      message: `This deletes the feedback from ${item.email}. This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBusyId(item.id);
    try {
      await adminApi.deleteFeedback(item.id);
      toast.success('Feedback deleted');
      await load();
      counts.refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <AdminLayout
      breadcrumb={[{ label: 'Feedback' }]}
      heroTitle="Feedback"
      heroSub="What users are saying. Mark items as read once you've looked at them."
      heroTrailing={
        <span className="inline-flex items-center gap-1.5 bg-white/15 border border-white/25 text-white/95 text-[11px] font-bold tracking-[0.06em] uppercase px-3 py-1 rounded-full font-mono">
          <span className="text-white font-bold">{summary.new} new</span>
          <span className="text-white/60">·</span>
          <span>{summary.read} read</span>
        </span>
      }
    >

      {/* Status filter chips */}
      <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
        {FILTERS.map((f) => {
          const active = status === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer transition-colors border ${
                active
                  ? 'bg-blue text-white border-blue'
                  : 'bg-white text-ink-muted border-bd hover:border-blue-mid hover:text-blue'
              }`}
            >
              {f.label}
              {f.key === 'new' && summary.new > 0 && !active && (
                <span className="ml-1.5 text-[10.5px] font-bold text-blue">
                  {summary.new}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tag filter chips */}
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono mr-1">
          Tag
        </span>
        <button
          type="button"
          onClick={() => setTag('')}
          className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold cursor-pointer transition-colors border ${
            !tag
              ? 'bg-ink text-white border-ink'
              : 'bg-white text-ink-muted border-bd hover:border-ink/40 hover:text-ink'
          }`}
        >
          All
        </button>
        {FEEDBACK_TAGS.map((t) => {
          const active = tag === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTag(t.key)}
              className={`px-2.5 py-1 rounded-full text-[11.5px] font-semibold cursor-pointer transition-colors border ${
                active
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-ink-muted border-bd hover:border-ink/40 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <FeedbackList
        items={items}
        loading={items === null}
        emptyMessage={
          tag ? `No ${status === 'all' ? '' : `${status} `}feedback tagged "${tag}".` :
          status === 'new' ? 'No new feedback. You\u2019re all caught up.' :
          status === 'read' ? 'No read feedback yet.' :
          'No feedback has been submitted yet.'
        }
        onToggleRead={handleToggleRead}
        onDelete={handleDelete}
        busyId={busyId}
      />

      {/* Pagination */}
      {total > PER_PAGE && (
        <div className="flex items-center justify-between mt-4 text-[12.5px] text-ink-muted">
          <div>
            Page <span className="font-semibold text-ink">{page}</span> of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-md border border-bd bg-white text-ink-muted hover:border-blue-mid hover:text-blue cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-md border border-bd bg-white text-ink-muted hover:border-blue-mid hover:text-blue cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
