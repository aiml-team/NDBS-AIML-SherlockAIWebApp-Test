"""Admin panel backend routes. All endpoints require an authenticated admin
session (enforced via auth.require_admin). Reuses helpers from auth.py for
DB access, OTP generation and emailing."""
import logging

from flask import jsonify, request, session

from auth import (
    _conn,
    _get_user,
    _make_otp,
    _send_otp_email,
    _store_otp,
    is_allowed_email,
    require_admin,
)

logger = logging.getLogger('sherlock-web.admin')


# ─── Helpers ────────────────────────────────────────────────
def _admin_public_user(u):
    """Like auth._public_user but includes id and created_at for admin views."""
    if not u:
        return None
    return {
        'id': u['id'],
        'email': u['email'],
        'verified': bool(u['verified']),
        'is_admin': bool(u.get('is_admin', 0)),
        'created_at': u['created_at'],
        'has_password': bool(u.get('password_hash')),
    }


def _admin_count():
    with _conn() as c:
        row = c.execute('SELECT COUNT(*) AS n FROM users WHERE is_admin=1').fetchone()
    return int(row['n']) if row else 0


def _get_user_by_id(uid):
    with _conn() as c:
        row = c.execute(
            'SELECT id, email, password_hash, verified, is_admin, created_at FROM users WHERE id=?',
            (uid,),
        ).fetchone()
    return dict(row) if row else None


def _current_user():
    email = session.get('email')
    if not email:
        return None
    return _get_user(email)


# ─── Route handlers ─────────────────────────────────────────
@require_admin
def list_users():
    q = (request.args.get('q') or '').strip().lower()
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(100, int(request.args.get('per_page', 25))))
    except (TypeError, ValueError):
        page, per_page = 1, 25

    offset = (page - 1) * per_page

    with _conn() as c:
        if q:
            like = f'%{q}%'
            total = c.execute(
                'SELECT COUNT(*) AS n FROM users WHERE lower(email) LIKE ?',
                (like,),
            ).fetchone()['n']
            rows = c.execute(
                'SELECT id, email, password_hash, verified, is_admin, created_at '
                'FROM users WHERE lower(email) LIKE ? '
                'ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?',
                (like, per_page, offset),
            ).fetchall()
        else:
            total = c.execute('SELECT COUNT(*) AS n FROM users').fetchone()['n']
            rows = c.execute(
                'SELECT id, email, password_hash, verified, is_admin, created_at '
                'FROM users ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?',
                (per_page, offset),
            ).fetchall()

    users = [_admin_public_user(dict(r)) for r in rows]
    return jsonify({
        'users': users,
        'total': int(total),
        'page': page,
        'per_page': per_page,
    })


@require_admin
def create_user():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    want_admin = bool(data.get('is_admin'))

    if not is_allowed_email(email):
        return jsonify({
            'success': False,
            'error': 'Email must be a @nttdata.com or @bs.nttdata.com address.',
        }), 400

    if _get_user(email):
        return jsonify({'success': False, 'error': 'email already exists'}), 409

    from auth import _now
    now = _now().isoformat()
    with _conn() as c:
        c.execute(
            'INSERT INTO users (email, password_hash, verified, is_admin, created_at) '
            'VALUES (?, ?, 0, ?, ?)',
            (email, '', 1 if want_admin else 0, now),
        )

    # Send "set password" OTP via existing reset flow
    otp = _make_otp()
    _store_otp(email, 'reset', otp)
    try:
        _send_otp_email(email, otp, 'reset')
    except Exception as exc:  # noqa: BLE001
        logger.warning('Failed to send setup email to %s: %s', email, exc)
        # User row still exists; admin can retry via "send reset email".
        user = _get_user(email)
        return jsonify({
            'success': True,
            'user': _admin_public_user(user),
            'warning': 'User created but email delivery failed. Use "Send reset email" to retry.',
        }), 201

    user = _get_user(email)
    return jsonify({'success': True, 'user': _admin_public_user(user)}), 201


@require_admin
def get_user_detail(user_id):
    target = _get_user_by_id(user_id)
    if not target:
        return jsonify({'success': False, 'error': 'user not found'}), 404
    return jsonify({
        'user': _admin_public_user(target),
        'prospects_note': (
            'User-prospect linkage is not tracked yet. '
            'See all prospects across users in a future release.'
        ),
    })


@require_admin
def set_admin_flag(user_id):
    data = request.get_json(silent=True) or {}
    if 'is_admin' not in data:
        return jsonify({'success': False, 'error': 'is_admin is required'}), 400
    want_admin = bool(data.get('is_admin'))

    target = _get_user_by_id(user_id)
    if not target:
        return jsonify({'success': False, 'error': 'user not found'}), 404

    me = _current_user()
    if me and me['id'] == target['id'] and not want_admin:
        return jsonify({'success': False, 'error': 'cannot demote yourself'}), 403

    # Last-admin protection: only blocks demotion of the only remaining admin.
    if target.get('is_admin') and not want_admin and _admin_count() <= 1:
        return jsonify({'success': False, 'error': 'cannot demote the last admin'}), 403

    with _conn() as c:
        c.execute('UPDATE users SET is_admin=? WHERE id=?', (1 if want_admin else 0, user_id))

    updated = _get_user_by_id(user_id)
    return jsonify({'success': True, 'user': _admin_public_user(updated)})


@require_admin
def verify_user_route(user_id):
    target = _get_user_by_id(user_id)
    if not target:
        return jsonify({'success': False, 'error': 'user not found'}), 404

    with _conn() as c:
        c.execute('UPDATE users SET verified=1 WHERE id=?', (user_id,))

    updated = _get_user_by_id(user_id)
    return jsonify({'success': True, 'user': _admin_public_user(updated)})


@require_admin
def send_reset_for_user(user_id):
    target = _get_user_by_id(user_id)
    if not target:
        return jsonify({'success': False, 'error': 'user not found'}), 404

    email = target['email']
    otp = _make_otp()
    _store_otp(email, 'reset', otp)
    try:
        _send_otp_email(email, otp, 'reset')
    except Exception as exc:  # noqa: BLE001
        logger.warning('Failed to send reset email to %s: %s', email, exc)
        return jsonify({'success': False, 'error': 'could not send email'}), 500

    return jsonify({'success': True})


@require_admin
def delete_user_route(user_id):
    target = _get_user_by_id(user_id)
    if not target:
        return jsonify({'success': False, 'error': 'user not found'}), 404

    me = _current_user()
    if me and me['id'] == target['id']:
        return jsonify({'success': False, 'error': 'cannot delete yourself'}), 403

    if target.get('is_admin') and _admin_count() <= 1:
        return jsonify({'success': False, 'error': 'cannot delete the last admin'}), 403

    with _conn() as c:
        c.execute('DELETE FROM users WHERE id=?', (user_id,))
        # Also invalidate any pending OTPs for this email.
        c.execute('UPDATE otps SET used=1 WHERE lower(email)=lower(?)', (target['email'],))

    return jsonify({'success': True})


# ─── Registration ───────────────────────────────────────────
def register_routes(app):
    app.add_url_rule('/api/admin/users',
                     view_func=list_users, methods=['GET'])
    app.add_url_rule('/api/admin/users',
                     view_func=create_user, methods=['POST'])
    app.add_url_rule('/api/admin/users/<int:user_id>',
                     view_func=get_user_detail, methods=['GET'])
    app.add_url_rule('/api/admin/users/<int:user_id>/admin',
                     view_func=set_admin_flag, methods=['PATCH'])
    app.add_url_rule('/api/admin/users/<int:user_id>/verify',
                     view_func=verify_user_route, methods=['POST'])
    app.add_url_rule('/api/admin/users/<int:user_id>/reset',
                     view_func=send_reset_for_user, methods=['POST'])
    app.add_url_rule('/api/admin/users/<int:user_id>',
                     view_func=delete_user_route, methods=['DELETE'])
