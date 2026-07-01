import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/admin/AdminLayout.jsx';
import UserRowActions from '../components/admin/UserRowActions.jsx';
import UserStatusBadge from '../components/admin/UserStatusBadge.jsx';
import CreateUserModal from '../components/admin/CreateUserModal.jsx';
import DeleteUserDialog from '../components/admin/DeleteUserDialog.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { adminApi } from '../lib/api.js';

const PER_PAGE = 25;

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

export default function AdminUsersPage() {
  const { user: me, refresh: refreshAuth } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const res = await adminApi.backfillIndustries();
      toast.success(
        `Updated ${res.updated} · Skipped ${res.skipped} · Failed ${res.failed}`,
        { title: 'Industry backfill complete' },
      );
    } catch (e) {
      toast.error(e.message || 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  }

  const searchRef = useRef(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Reset to page 1 whenever query changes
  useEffect(() => { setPage(1); }, [debouncedQuery]);

  const load = useCallback(async () => {
    try {
      const data = await adminApi.listUsers({ q: debouncedQuery, page, perPage: PER_PAGE });
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (e) {
      setUsers([]);
      toast.error(e.message || 'Failed to load users');
    }
  }, [debouncedQuery, page, toast]);

  useEffect(() => { load(); }, [load]);

  const adminCount = useMemo(
    () => (users || []).reduce((n, u) => n + (u.is_admin ? 1 : 0), 0),
    [users],
  );

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const currentUserId = me?.id ?? null;

  // ── Actions ────────────────────────────────────────────────
  async function handleCreate({ email, isAdmin }) {
    setCreating(true);
    try {
      const res = await adminApi.createUser({ email, isAdmin });
      if (res.warning) {
        toast.info(res.warning, { ttl: 8000 });
      } else {
        toast.success(`Created ${email}. A setup email was sent.`);
      }
      setShowCreate(false);
      await load();
    } catch (e) {
      toast.error(e.message || 'Could not create user');
    } finally {
      setCreating(false);
    }
  }

  async function handlePromote(u) {
    try {
      await adminApi.setAdmin(u.id, true);
      toast.success(`${u.email} is now an admin`);
      await load();
    } catch (e) { toast.error(e.message); }
  }

  async function handleDemote(u) {
    try {
      await adminApi.setAdmin(u.id, false);
      toast.success(`${u.email} is no longer an admin`);
      await load();
      if (u.id === currentUserId) await refreshAuth();
    } catch (e) { toast.error(e.message); }
  }

  async function handleVerify(u) {
    try {
      await adminApi.verifyUser(u.id);
      toast.success(`${u.email} marked as verified`);
      await load();
    } catch (e) { toast.error(e.message); }
  }

  async function handleReset(u) {
    try {
      await adminApi.sendResetOtp(u.id);
      toast.success(`Reset email sent to ${u.email}`);
    } catch (e) { toast.error(e.message); }
  }

  async function handleDelete(u) {
    setDeleting(true);
    try {
      await adminApi.deleteUser(u.id);
      toast.success(`Deleted ${u.email}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  }

  // We need the *current* user's id to fully apply self-protection. /api/auth/me
  // only returns email + flags. We resolve currentUserId by matching email
  // in the loaded list.
  const myId = useMemo(() => {
    if (!me?.email || !users) return null;
    const found = users.find((u) => u.email.toLowerCase() === me.email.toLowerCase());
    return found?.id ?? null;
  }, [me, users]);

  return (
    <AdminLayout
      breadcrumb={[{ label: 'Users' }]}
      heroTitle="Users"
      heroSub="Manage who can sign in and who has admin access."
    >
      {/* Search + actions toolbar */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-[420px]">
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email…"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-bd bg-white text-[13px] text-ink focus:outline-none focus:border-blue-mid focus:ring-2 focus:ring-blue-lt"
          />
          <svg
            viewBox="0 0 16 16"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 fill-ink-soft pointer-events-none"
          >
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.017-.014ZM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z" />
          </svg>
        </div>
        <div className="text-[12px] text-ink-soft font-mono flex-1">
          {users === null ? '—' : `${total} user${total === 1 ? '' : 's'}`}
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-[18px] py-2.5 rounded-[10px] text-[13.5px] font-bold bg-btn-blue text-white hover:-translate-y-px hover:shadow-btnBlueLg cursor-pointer transition-all border-none shadow-btnBlue whitespace-nowrap"
        >
          <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-white">
            <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
          </svg>
          Create user
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-bd overflow-hidden shadow-soft">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-bg border-b border-bd text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono">
              <th className="text-left px-4 py-2.5">Email</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-left px-4 py-2.5">Created</th>
              <th className="text-right px-4 py-2.5 w-[80px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users === null && (
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-bd last:border-b-0">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-48" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-6 w-6 ml-auto" /></td>
                  </tr>
                ))}
              </>
            )}

            {users && users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-ink-soft text-[13px]">
                  {debouncedQuery ? 'No users match your search.' : 'No users yet.'}
                </td>
              </tr>
            )}

            {users && users.map((u) => (
              <tr key={u.id} className="border-b border-bd last:border-b-0 hover:bg-blue-lt/30 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    to={`/admin/users/${u.id}`}
                    className="text-ink font-semibold no-underline hover:text-blue"
                  >
                    {u.email}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <UserStatusBadge user={u} />
                </td>
                <td className="px-4 py-3 text-ink-muted tabular-nums">
                  {formatDate(u.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <UserRowActions
                    user={u}
                    currentUserId={myId}
                    adminCount={adminCount}
                    onPromote={handlePromote}
                    onDemote={handleDemote}
                    onVerify={handleVerify}
                    onReset={handleReset}
                    onDelete={(target) => setDeleteTarget(target)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PER_PAGE && (
        <div className="flex items-center justify-between mt-4 text-[12.5px] text-ink-muted">
          <div>
            Page <span className="font-semibold text-ink">{page}</span> of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-md border border-bd bg-white text-ink-muted hover:border-blue-mid hover:text-blue cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-md border border-bd bg-white text-ink-muted hover:border-blue-mid hover:text-blue cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      <CreateUserModal
        open={showCreate}
        busy={creating}
        onClose={() => !creating && setShowCreate(false)}
        onSubmit={handleCreate}
      />

      <DeleteUserDialog
        open={!!deleteTarget}
        user={deleteTarget}
        busy={deleting}
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      {/* ── Maintenance ─────────────────────────── */}
      <div className="mt-6 bg-white border border-bd rounded-xl shadow-soft p-5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono mb-1">
          Maintenance
        </h2>
        <p className="text-[12.5px] text-ink-muted mb-3">
          Backfill industry labels for existing prospects that were created before automatic classification was added.
          Each prospect's <code className="font-mono text-[11.5px] bg-bg3 px-1 py-0.5 rounded">master_data.json</code> will be
          read, classified by LLM, and labelled. Already-labelled prospects are skipped.
        </p>
        <button
          type="button"
          onClick={handleBackfill}
          disabled={backfilling}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold bg-blue text-white hover:opacity-90 transition-all border-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {backfilling ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              Classifying…
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 8a6 6 0 1 1 1.5 4" />
                <path d="M2 12V8h4" />
              </svg>
              Backfill industry labels
            </>
          )}
        </button>
      </div>
    </AdminLayout>
  );
}
