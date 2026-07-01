const BASE = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider font-mono';

export default function UserStatusBadge({ user }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {user.is_admin && (
        <span className={`${BASE} bg-blue-lt text-blue-dark`}>Admin</span>
      )}
      {user.verified ? (
        <span className={`${BASE} bg-green-lt text-green-dark`}>Verified</span>
      ) : user.has_password ? (
        <span className={`${BASE} bg-amber-100 text-amber-800`}>Unverified</span>
      ) : (
        <span className={`${BASE} bg-bg3 text-ink-soft`}>Pending setup</span>
      )}
    </div>
  );
}
