"""SQLite-backed auth: signup with email OTP verification, password login,
forgot-password OTP reset, session cookies, allowed-domain check."""
import functools
import logging
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

from flask import jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from mailer import send_email

logger = logging.getLogger('sherlock-web.auth')

# On Azure App Service, /home/site exists and /home/ is persistent across restarts.
# Fall back to the local directory for dev.
_DEFAULT_DB = '/home/users.db' if os.path.isdir('/home/site') else os.path.join(os.path.dirname(__file__), 'users.db')
DB_PATH = os.environ.get('DB_PATH', _DEFAULT_DB)

ALLOWED_DOMAINS = ('nttdata.com', 'bs.nttdata.com')
EMAIL_RE = re.compile(r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')

PASSWORD_MIN_LEN = 8
OTP_LEN = 6
OTP_TTL_MINUTES = 10
OTP_COOLDOWN_SECONDS = 30  # min gap between OTP requests for same email/purpose


def _now():
    return datetime.now(timezone.utc)


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _admin_emails_from_env():
    raw = os.environ.get('ADMIN_EMAILS', '')
    return {e.strip().lower() for e in raw.split(',') if e.strip()}


def init_db():
    os.makedirs(os.path.dirname(DB_PATH) or '.', exist_ok=True)
    with _conn() as c:
        c.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                verified INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS otps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL COLLATE NOCASE,
                otp_hash TEXT NOT NULL,
                purpose TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS otps_email_purpose_idx ON otps(email, purpose);
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL COLLATE NOCASE,
                message TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at DESC);
            CREATE INDEX IF NOT EXISTS feedback_is_read_idx ON feedback(is_read);
        """)
        try:
            c.execute('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
        except sqlite3.OperationalError:
            pass

        for ddl in (
            'ALTER TABLE feedback ADD COLUMN rating INTEGER',
            'ALTER TABLE feedback ADD COLUMN tag TEXT',
            'ALTER TABLE feedback ADD COLUMN screenshot_path TEXT',
            'ALTER TABLE feedback ADD COLUMN screenshot_mime TEXT',
        ):
            try:
                c.execute(ddl)
            except sqlite3.OperationalError:
                pass

        admins = _admin_emails_from_env()
        if admins:
            placeholders = ','.join('?' for _ in admins)
            c.execute(
                f'UPDATE users SET is_admin=1 WHERE lower(email) IN ({placeholders})',
                tuple(admins),
            )
    logger.info('Auth DB ready at %s', DB_PATH)


# ─── Helpers ────────────────────────────────────────────────
def is_allowed_email(email):
    if not isinstance(email, str):
        return False
    e = email.strip().lower()
    if not EMAIL_RE.match(e):
        return False
    domain = e.rsplit('@', 1)[-1]
    return domain in ALLOWED_DOMAINS


def password_problems(pw):
    if not isinstance(pw, str):
        return 'Password is required.'
    if len(pw) < PASSWORD_MIN_LEN:
        return f'Password must be at least {PASSWORD_MIN_LEN} characters.'
    return None


def _make_otp():
    # Cryptographically random 6-digit string.
    return ''.join(str(secrets.randbelow(10)) for _ in range(OTP_LEN))


def _store_otp(email, purpose, otp):
    expires = (_now() + timedelta(minutes=OTP_TTL_MINUTES)).isoformat()
    with _conn() as c:
        # Invalidate any previous unused OTPs for this email + purpose.
        c.execute(
            'UPDATE otps SET used=1 WHERE email=? AND purpose=? AND used=0',
            (email, purpose),
        )
        c.execute(
            'INSERT INTO otps (email, otp_hash, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
            (email, generate_password_hash(otp), purpose, expires, _now().isoformat()),
        )


def _recent_otp_exists(email, purpose):
    """Returns True if an OTP was issued for (email, purpose) within the cooldown."""
    cutoff = (_now() - timedelta(seconds=OTP_COOLDOWN_SECONDS)).isoformat()
    with _conn() as c:
        row = c.execute(
            'SELECT 1 FROM otps WHERE email=? AND purpose=? AND created_at>? LIMIT 1',
            (email, purpose, cutoff),
        ).fetchone()
    return bool(row)


def _verify_and_consume_otp(email, purpose, otp):
    with _conn() as c:
        rows = c.execute(
            'SELECT id, otp_hash, expires_at FROM otps WHERE email=? AND purpose=? AND used=0 ORDER BY id DESC LIMIT 5',
            (email, purpose),
        ).fetchall()
        for r in rows:
            try:
                expires = datetime.fromisoformat(r['expires_at'])
            except Exception:
                continue
            if expires < _now():
                continue
            if check_password_hash(r['otp_hash'], otp):
                c.execute('UPDATE otps SET used=1 WHERE id=?', (r['id'],))
                return True
    return False


def _get_user(email):
    with _conn() as c:
        row = c.execute(
            'SELECT id, email, password_hash, verified, is_admin, created_at FROM users WHERE email=?',
            (email,),
        ).fetchone()
    return dict(row) if row else None


def _public_user(u):
    if not u:
        return None
    return {
        'email': u['email'],
        'verified': bool(u['verified']),
        'is_admin': bool(u.get('is_admin', 0)),
    }


def _login(email):
    session.clear()
    session['email'] = email
    session.permanent = True


# ─── Route handlers (registered by register_routes) ───────────
def _send_otp_email(email, otp, purpose):
    if purpose == 'signup':
        subject = 'Verify your Sherlock AI account'
        body = (
            f'Your verification code is:\n\n    {otp}\n\n'
            f'This code expires in {OTP_TTL_MINUTES} minutes.\n'
            'If you did not request this, you can ignore this email.\n'
        )
    else:
        subject = 'Reset your Sherlock AI password'
        body = (
            f'Your password-reset code is:\n\n    {otp}\n\n'
            f'This code expires in {OTP_TTL_MINUTES} minutes.\n'
            'If you did not request this, you can ignore this email.\n'
        )
    send_email(email, subject, body)


def signup_request():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not is_allowed_email(email):
        return jsonify({
            'success': False,
            'error': 'Email must be a @nttdata.com or @bs.nttdata.com address.',
        }), 400

    pw_err = password_problems(password)
    if pw_err:
        return jsonify({'success': False, 'error': pw_err}), 400

    existing = _get_user(email)
    if existing and existing['verified']:
        return jsonify({
            'success': False,
            'error': 'An account already exists for that email. Try signing in instead.',
        }), 409

    if _recent_otp_exists(email, 'signup'):
        return jsonify({
            'success': False,
            'error': 'A code was just sent. Please wait a moment before requesting another.',
        }), 429

    pw_hash = generate_password_hash(password)
    with _conn() as c:
        if existing:
            c.execute('UPDATE users SET password_hash=?, verified=0 WHERE id=?', (pw_hash, existing['id']))
        else:
            c.execute(
                'INSERT INTO users (email, password_hash, verified, created_at) VALUES (?, ?, 0, ?)',
                (email, pw_hash, _now().isoformat()),
            )

    otp = _make_otp()
    _store_otp(email, 'signup', otp)
    _send_otp_email(email, otp, 'signup')
    return jsonify({'success': True, 'email': email})


def signup_verify():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    otp = (data.get('otp') or '').strip()

    if not is_allowed_email(email) or not otp.isdigit() or len(otp) != OTP_LEN:
        return jsonify({'success': False, 'error': 'Invalid code or email.'}), 400

    user = _get_user(email)
    if not user:
        return jsonify({'success': False, 'error': 'No pending signup found.'}), 404

    if not _verify_and_consume_otp(email, 'signup', otp):
        return jsonify({'success': False, 'error': 'That code is invalid or has expired.'}), 400

    promote_admin = email in _admin_emails_from_env()
    with _conn() as c:
        if promote_admin:
            c.execute('UPDATE users SET verified=1, is_admin=1 WHERE id=?', (user['id'],))
        else:
            c.execute('UPDATE users SET verified=1 WHERE id=?', (user['id'],))

    _login(email)
    return jsonify({'success': True, 'user': _public_user(_get_user(email))})


def login():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    user = _get_user(email)
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'success': False, 'error': 'Incorrect email or password.'}), 401

    if not user['verified']:
        return jsonify({
            'success': False,
            'error': 'Please verify your email first. Sign up again to receive a new code.',
            'needs_verification': True,
        }), 403

    _login(email)
    return jsonify({'success': True, 'user': _public_user(user)})


def logout():
    session.clear()
    return jsonify({'success': True})


def me():
    email = session.get('email')
    if not email:
        return jsonify({'authenticated': False}), 401
    user = _get_user(email)
    if not user or not user['verified']:
        session.clear()
        return jsonify({'authenticated': False}), 401
    return jsonify({'authenticated': True, 'user': _public_user(user)})


def forgot_password():
    """Always returns success to prevent email enumeration."""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()

    if not is_allowed_email(email):
        return jsonify({
            'success': False,
            'error': 'Email must be a @nttdata.com or @bs.nttdata.com address.',
        }), 400

    user = _get_user(email)
    if user and user['verified'] and not _recent_otp_exists(email, 'reset'):
        otp = _make_otp()
        _store_otp(email, 'reset', otp)
        _send_otp_email(email, otp, 'reset')

    return jsonify({'success': True})


def reset_password():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    otp = (data.get('otp') or '').strip()
    new_password = data.get('password') or ''

    if not is_allowed_email(email):
        return jsonify({'success': False, 'error': 'Invalid email.'}), 400
    pw_err = password_problems(new_password)
    if pw_err:
        return jsonify({'success': False, 'error': pw_err}), 400

    user = _get_user(email)
    if not user or not user['verified']:
        return jsonify({'success': False, 'error': 'Invalid code or email.'}), 400

    if not _verify_and_consume_otp(email, 'reset', otp):
        return jsonify({'success': False, 'error': 'That code is invalid or has expired.'}), 400

    with _conn() as c:
        c.execute('UPDATE users SET password_hash=? WHERE id=?',
                  (generate_password_hash(new_password), user['id']))

    _login(email)
    return jsonify({'success': True, 'user': _public_user(_get_user(email))})


# ─── Route guard decorator ──────────────────────────────────
def require_auth(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        email = session.get('email')
        if not email:
            return jsonify({'authenticated': False, 'error': 'Not authenticated'}), 401
        user = _get_user(email)
        if not user or not user['verified']:
            session.clear()
            return jsonify({'authenticated': False, 'error': 'Not authenticated'}), 401
        return view(*args, **kwargs)
    return wrapped


def require_admin(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        email = session.get('email')
        if not email:
            return jsonify({'authenticated': False, 'error': 'Not authenticated'}), 401
        user = _get_user(email)
        if not user or not user['verified']:
            session.clear()
            return jsonify({'authenticated': False, 'error': 'Not authenticated'}), 401
        if not user.get('is_admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        return view(*args, **kwargs)
    return wrapped


def current_user_email():
    return session.get('email')


def register_routes(app):
    app.add_url_rule('/api/auth/signup-request',  view_func=signup_request, methods=['POST'])
    app.add_url_rule('/api/auth/signup-verify',   view_func=signup_verify,  methods=['POST'])
    app.add_url_rule('/api/auth/login',           view_func=login,          methods=['POST'])
    app.add_url_rule('/api/auth/logout',          view_func=logout,         methods=['POST'])
    app.add_url_rule('/api/auth/me',              view_func=me,             methods=['GET'])
    app.add_url_rule('/api/auth/forgot-password', view_func=forgot_password, methods=['POST'])
    app.add_url_rule('/api/auth/reset-password',  view_func=reset_password, methods=['POST'])
