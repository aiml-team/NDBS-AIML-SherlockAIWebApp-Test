import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../components/admin/AdminLayout.jsx';
import UserStatusBadge from '../components/admin/UserStatusBadge.jsx';
import DeleteUserDialog from '../components/admin/DeleteUserDialog.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { adminApi } from '../lib/api.js';

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

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: me, refresh: refreshAuth } = useAuth();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const load = useCallback(async () => {
    setNotFound(false);
    try {
      const res = await adminApi.getUser(id);
      setData(res);
    } catch (e) {
      if (e.status === 404) setNotFound(true);
      else toast.error(e.message || 'Failed to load user');
    }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  if (notFound) {
    return (
      <AdminLayout
        breadcrumb={[{ label: 'Users', to: '/admin/users' }, { label: 'Not found' }]}
        heroTitle="User not found"
        heroSub="This user may have been deleted or the ID is invalid."
      >
        <Link
          to="/admin/users"
          className="inline-block px-4 py-2 rounded-lg text-[13px] font-semibold bg-blue text-white hover:opacity-90 no-underline transition-all"
        >
          ← Back to users
        </Link>
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout
        breadcrumb={[{ label: 'Users', to: '/admin/users' }, { label: '…' }]}
        heroTitle="…"
        heroSub="Loading user details"
      >
        <Skeleton className="h-48 w-full" />
      </AdminLayout>
    );
  }

  const u = data.user;
  const isSelf = me?.email?.toLowerCase() === u.email.toLowerCase();

  async function withBusy(fn, successMsg) {
    setBusy(true);
    try {
      await fn();
      if (successMsg) toast.success(successMsg);
      await load();
    } catch (e) {
      toast.error(e.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function onTogglePromote() {
    const next = !u.is_admin;
    await withBusy(
      () => adminApi.setAdmin(u.id, next),
      next ? `${u.email} is now an admin` : `${u.email} is no longer an admin`,
    );
    if (isSelf) await refreshAuth();
  }

  async function onVerify() {
    await withBusy(
      () => adminApi.verifyUser(u.id),
      `${u.email} marked as verified`,
    );
  }

  async function onReset() {
    setBusy(true);
    try {
      await adminApi.sendResetOtp(u.id);
      toast.success(`Reset email sent to ${u.email}`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDelete() {
    setBusy(true);
    try {
      await adminApi.deleteUser(u.id);
      toast.success(`Deleted ${u.email}`);
      navigate('/admin/users', { replace: true });
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  }

  return (
    <AdminLayout
      breadcrumb={[
        { label: 'Users', to: '/admin/users' },
        { label: u.email },
      ]}
      heroTitle={u.email}
      heroSub="User profile and account management"
      heroTrailing={<UserStatusBadge user={u} />}
    >
      <div className="flex items-center justify-between mb-5">
        <UserStatusBadge user={u} />
        <Link to="/admin/users" className="text-[13px] font-semibold text-ink-muted hover:text-blue no-underline">
          ← Back to all users
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Profile card */}
        <section className="bg-white rounded-xl border border-bd shadow-soft p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono mb-3">
            Profile
          </h2>
          <dl className="grid grid-cols-[110px_1fr] gap-y-2.5 gap-x-4 text-[13px]">
            <dt className="text-ink-soft">ID</dt>
            <dd className="text-ink font-mono tabular-nums">{u.id}</dd>
            <dt className="text-ink-soft">Email</dt>
            <dd className="text-ink break-all">{u.email}</dd>
            <dt className="text-ink-soft">Verified</dt>
            <dd className="text-ink">{u.verified ? 'Yes' : 'No'}</dd>
            <dt className="text-ink-soft">Admin</dt>
            <dd className="text-ink">{u.is_admin ? 'Yes' : 'No'}</dd>
            <dt className="text-ink-soft">Has password</dt>
            <dd className="text-ink">{u.has_password ? 'Yes' : 'No (pending setup)'}</dd>
            <dt className="text-ink-soft">Created</dt>
            <dd className="text-ink tabular-nums">{formatDate(u.created_at)}</dd>
          </dl>
        </section>

        {/* Actions card */}
        <section className="bg-white rounded-xl border border-bd shadow-soft p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono mb-3">
            Actions
          </h2>
          <div className="flex flex-col gap-2.5">
            <ActionButton
              onClick={onTogglePromote}
              disabled={busy || (isSelf && u.is_admin)}
              disabledHint={isSelf && u.is_admin ? 'You cannot demote yourself' : ''}
              variant={u.is_admin ? 'ghost' : 'primary'}
            >
              {u.is_admin ? 'Demote from admin' : 'Promote to admin'}
            </ActionButton>

            {!u.verified && (
              <ActionButton onClick={onVerify} disabled={busy} variant="ghost">
                Mark as verified
              </ActionButton>
            )}

            <ActionButton onClick={onReset} disabled={busy} variant="ghost">
              Send password reset email
            </ActionButton>

            <div className="h-px bg-bd my-1" />

            <ActionButton
              onClick={() => setShowDelete(true)}
              disabled={busy || isSelf}
              disabledHint={isSelf ? 'You cannot delete yourself' : ''}
              variant="danger"
            >
              Delete user…
            </ActionButton>
          </div>
        </section>

        {/* Prospects placeholder card */}
        <section className="bg-white rounded-xl border border-bd shadow-soft p-5 lg:col-span-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono mb-3">
            Prospects
          </h2>
          <div className="bg-bg border border-bd border-dashed rounded-lg px-4 py-6 text-center">
            <p className="text-[13px] text-ink-muted">
              User-prospect linkage is not tracked yet.
            </p>
            <p className="text-[12px] text-ink-soft mt-1">
              {data.prospects_note}
            </p>
          </div>
        </section>
      </div>

      <DeleteUserDialog
        open={showDelete}
        user={u}
        busy={busy}
        onCancel={() => !busy && setShowDelete(false)}
        onConfirm={onConfirmDelete}
      />
    </AdminLayout>
  );
}

function ActionButton({ children, onClick, disabled, disabledHint, variant }) {
  const base = 'w-full text-left px-3.5 py-2.5 rounded-lg text-[13px] font-semibold transition-all border cursor-pointer disabled:cursor-not-allowed disabled:opacity-50';
  const variants = {
    primary: 'bg-blue text-white border-blue hover:opacity-90',
    ghost:   'bg-white text-ink border-bd hover:border-blue-mid hover:bg-blue-lt hover:text-blue',
    danger:  'bg-white text-red border-bd hover:border-red-mid hover:bg-red-lt',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledHint : ''}
      className={`${base} ${variants[variant] || variants.ghost}`}
    >
      {children}
    </button>
  );
}
