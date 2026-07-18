import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useToast } from '../ui/Toast.jsx';
import { useConfirm } from '../ui/Confirm.jsx';

const RESOURCES = [
  {
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h7A1.5 1.5 0 0 1 12 3.5v9A1.5 1.5 0 0 1 10.5 14h-7A1.5 1.5 0 0 1 2 12.5v-9Z" />
        <path d="M5 5.5h4M5 7.5h4M5 9.5h2.5" />
      </svg>
    ),
    label: 'Release Document',
    url: 'https://ndbsaimlsherlockaiwebapp.blob.core.windows.net/sherlockaidocs/Release_Document_-_Sherlock_AI_v2_0_0.docx?sp=r&st=2026-07-18T12:24:38Z&se=2027-12-31T20:39:38Z&spr=https&sv=2026-02-06&sr=b&sig=fAgm3bB2lxO9N9D%2Bhw4OjFV0SntsnEfDawp3Ckc7Z%2Fc%3D',
  },
  {
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 4a1 1 0 0 1 1-1h3.5L8 5h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z" />
        <path d="M8 7.5v3M6.5 9h3" />
      </svg>
    ),
    label: 'User Manual',
    url: 'https://ndbsaimlsherlockaiwebapp.blob.core.windows.net/sherlockaidocs/Sherlock_AI_User_Manual_NTT.pptx?sp=r&st=2026-07-18T12:06:12Z&se=2027-12-31T20:21:12Z&spr=https&sv=2026-02-06&sr=b&sig=V0lYjPzZqVB8Umctm%2F%2Fl4vs%2FRXNVjsCNwqEmMib8fb8%3D',
  },
  {
    icon: (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="6" />
        <path d="M2 8h12M8 2a9.6 9.6 0 0 1 2.5 6A9.6 9.6 0 0 1 8 14 9.6 9.6 0 0 1 5.5 8 9.6 9.6 0 0 1 8 2Z" />
      </svg>
    ),
    label: 'Pursuit Library',
    url: 'https://itellicloud.sharepoint.com/sites/NACSP/Customer%20Pursuit/Forms/Library%20View.aspx?viewid=4df010a7%2D72b5%2D485d%2D814d%2D9bd0aff376f1',
  },
];

function initials(email) {
  if (!email) return '?';
  const local = email.split('@')[0] || '';
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (local[0] + (local[1] || '')).toUpperCase();
}

function SectionLabel({ children }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft font-mono">
      {children}
    </div>
  );
}

// Office files (.docx / .pptx / .xlsx) can't render natively in a browser.
// Wrap the URL in Microsoft's free Office Web Viewer so the file previews
// inline. This ensures exactly ONE tab opens per click (fixes the "double
// tab" issue caused by Office 365 browser extensions intercepting raw
// .docx/.pptx URLs).
function toViewerUrl(url) {
  if (typeof url !== 'string') return url;
  // Strip any hash/fragment before checking extension.
  const path = url.split('#')[0].split('?')[0].toLowerCase();
  if (/\.(docx|pptx|xlsx|doc|ppt|xls)$/.test(path)) {
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`;
  }
  return url;
}

function ExternalLinkRow({ icon, label, url, onSelect }) {
  const href = toViewerUrl(url);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onSelect}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-ink-muted hover:bg-blue-lt hover:text-blue cursor-pointer transition-colors no-underline group"
    >
      <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      <svg
        viewBox="0 0 16 16"
        className="w-3 h-3 fill-current opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0"
        aria-hidden="true"
      >
        <path d="M5.5 3a.75.75 0 0 0 0 1.5h4.94L3.22 11.72a.75.75 0 1 0 1.06 1.06L11.5 5.56v4.94a.75.75 0 0 0 1.5 0v-6.75A.75.75 0 0 0 12.25 3H5.5Z" />
      </svg>
    </a>
  );
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!user) return null;

  async function onLogout() {
    setOpen(false);
    const ok = await confirm({
      tone: 'primary',
      title: 'Sign out',
      message: 'You will need to sign in again to access this workspace.',
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    await logout();
    toast.info('Signed out');
    navigate('/login', { replace: true });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Account menu for ${user.email}`}
        title={user.email}
        className="flex items-center gap-2 bg-bg3 border border-bd rounded-full pl-1.5 pr-2.5 py-1.5 cursor-pointer hover:border-blue-mid hover:bg-blue-lt transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="w-9 h-9 rounded-full bg-gradient-to-br from-blue to-blue-dark text-white text-[13px] font-bold flex items-center justify-center font-mono">
          {initials(user.email)}
        </span>
        <svg viewBox="0 0 12 12" className="w-3.5 h-3.5 fill-ink-soft">
          <path d="M2 4l4 4 4-4z" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] w-[280px] bg-white border border-bd rounded-xl shadow-soft p-1.5 z-[300] animate-pop-in"
        >
          {/* ── Identity ──────────────────────────── */}
          <div className="px-3 pt-3 pb-3 flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-gradient-to-br from-blue to-blue-dark text-white text-[13px] font-bold flex items-center justify-center font-mono flex-shrink-0">
              {initials(user.email)}
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink truncate" title={user.email}>
                {user.email.split('@')[0]}
              </div>
              <div className="text-[11.5px] text-ink-soft truncate">{user.email}</div>
            </div>
          </div>

          <div className="h-px bg-bd mx-1.5" />

          {/* ── Resources ─────────────────────────── */}
          <div className="px-1.5 pt-2.5 pb-1.5">
            <div className="px-1.5 mb-1.5">
              <SectionLabel>Resources</SectionLabel>
            </div>
            <div className="flex flex-col">
              {RESOURCES.map((r) => (
                <ExternalLinkRow
                  key={r.url}
                  icon={r.icon}
                  label={r.label}
                  url={r.url}
                  onSelect={() => setOpen(false)}
                />
              ))}
            </div>
          </div>

          <div className="h-px bg-bd mx-1.5" />

          {/* ── Admin (admins only) ───────────────── */}
          {user.is_admin && (
            <>
              <div className="px-1.5 pt-2.5 pb-1.5">
                <div className="px-1.5 mb-1.5">
                  <SectionLabel>Admin</SectionLabel>
                </div>
                <Link
                  to="/admin/users"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-ink-muted hover:bg-blue-lt hover:text-blue cursor-pointer transition-colors no-underline"
                >
                  <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2L3 4v4c0 3 2.2 5.4 5 6 2.8-.6 5-3 5-6V4L8 2Z" />
                    </svg>
                  </span>
                  <span className="flex-1 truncate">Admin panel</span>
                </Link>
              </div>
              <div className="h-px bg-bd mx-1.5" />
            </>
          )}

          {/* ── Account actions ───────────────────── */}
          <div className="px-1.5 pt-1.5 pb-1.5">
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold text-ink-muted hover:bg-red-lt hover:text-red bg-transparent border-none cursor-pointer transition-colors"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current flex-shrink-0">
                <path d="M6 1.75A.75.75 0 0 1 6.75 1h6.5A.75.75 0 0 1 14 1.75v12.5a.75.75 0 0 1-.75.75h-6.5a.75.75 0 0 1 0-1.5h5.75V2.5H6.75A.75.75 0 0 1 6 1.75ZM2.78 5.22a.75.75 0 0 1 1.06 0L6.78 8.22a.75.75 0 0 1 0 1.06l-2.94 2.94a.75.75 0 1 1-1.06-1.06l1.65-1.66H10.5a.75.75 0 0 1 0 1.5H4.41l-1.63-1.62a.75.75 0 0 1 0-1.06Z" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
