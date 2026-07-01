"""User feedback: in-app submission + admin inbox.
Submission requires an authenticated session (any verified user).
Admin endpoints require require_admin.

Stores optional screenshots on local disk under feedback_uploads/."""
import logging
import os
import secrets
from datetime import timedelta

from flask import jsonify, request, send_file, abort

from auth import (
    _conn,
    _now,
    current_user_email,
    require_admin,
    require_auth,
)

logger = logging.getLogger('sherlock-web.feedback')

MAX_MESSAGE_LEN = 4000
SUBMIT_COOLDOWN_SECONDS = 30

MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024  # 5 MB
ALLOWED_TAGS = {'excellent', 'good', 'bad', 'confusing'}

# (mime, magic-bytes prefix, extension) — used for both validation and file naming.
IMAGE_TYPES = (
    ('image/png',  b'\x89PNG\r\n\x1a\n', 'png'),
    ('image/jpeg', b'\xff\xd8\xff',      'jpg'),
    ('image/webp', None,                 'webp'),   # checked separately (RIFF…WEBP)
    ('image/gif',  b'GIF87a',            'gif'),
    ('image/gif',  b'GIF89a',            'gif'),
)
ALLOWED_MIMES = {m for m, _, _ in IMAGE_TYPES}

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'feedback_uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ─── Helpers ────────────────────────────────────────────────
def _row_to_dict(row):
    if not row:
        return None
    return {
        'id': row['id'],
        'email': row['email'],
        'message': row['message'],
        'rating': row['rating'] if row['rating'] is not None else None,
        'tag': row['tag'] if row['tag'] else None,
        'has_screenshot': bool(row['screenshot_path']),
        'is_read': bool(row['is_read']),
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
    }


def _recent_submission(email):
    cutoff = (_now() - timedelta(seconds=SUBMIT_COOLDOWN_SECONDS)).isoformat()
    with _conn() as c:
        row = c.execute(
            'SELECT 1 FROM feedback WHERE lower(email)=lower(?) AND created_at > ? LIMIT 1',
            (email, cutoff),
        ).fetchone()
    return bool(row)


def _detect_image(head_bytes, declared_mime):
    """Return (canonical_mime, extension) if head_bytes match an allowed image
    type, else (None, None). The declared MIME is informational only — we trust
    the magic bytes."""
    # PNG / JPEG / GIF — straightforward prefix match
    for mime, prefix, ext in IMAGE_TYPES:
        if prefix and head_bytes.startswith(prefix):
            return mime, ext
    # WebP: starts with 'RIFF' .... 'WEBP'
    if len(head_bytes) >= 12 and head_bytes[:4] == b'RIFF' and head_bytes[8:12] == b'WEBP':
        return 'image/webp', 'webp'
    return None, None


def _parse_int_in_range(s, lo, hi):
    try:
        n = int(s)
    except (TypeError, ValueError):
        return None
    if n < lo or n > hi:
        return None
    return n


def _delete_screenshot(path):
    if not path:
        return
    full = os.path.join(UPLOAD_DIR, path)
    if not os.path.abspath(full).startswith(os.path.abspath(UPLOAD_DIR)):
        return  # path traversal guard
    try:
        os.remove(full)
    except FileNotFoundError:
        pass
    except OSError as exc:
        logger.warning('Could not delete screenshot %s: %s', path, exc)


# ─── User-facing endpoints ──────────────────────────────────
@require_auth
def submit_feedback():
    email = current_user_email()
    if not email:
        return jsonify({'success': False, 'error': 'not authenticated'}), 401

    # Accept either multipart/form-data (preferred — supports file) or JSON
    # (legacy clients without screenshot).
    if request.content_type and request.content_type.startswith('multipart/'):
        form = request.form
        file_obj = request.files.get('screenshot')
    else:
        data = request.get_json(silent=True) or {}
        form = {k: ('' if v is None else str(v)) for k, v in data.items()}
        file_obj = None

    message = (form.get('message') or '').strip()
    rating_raw = (form.get('rating') or '').strip()
    tag_raw = (form.get('tag') or '').strip().lower()

    # Message validation
    if not message:
        return jsonify({'success': False, 'error': 'message is required'}), 400
    if len(message) > MAX_MESSAGE_LEN:
        return jsonify({
            'success': False,
            'error': f'message too long (max {MAX_MESSAGE_LEN} characters)',
        }), 400

    # Rating validation (optional)
    rating = None
    if rating_raw:
        rating = _parse_int_in_range(rating_raw, 1, 5)
        if rating is None:
            return jsonify({'success': False, 'error': 'rating must be 1–5'}), 400

    # Tag validation (optional)
    tag = None
    if tag_raw:
        if tag_raw not in ALLOWED_TAGS:
            return jsonify({
                'success': False,
                'error': f'tag must be one of: {", ".join(sorted(ALLOWED_TAGS))}',
            }), 400
        tag = tag_raw

    # Rate limit
    if _recent_submission(email):
        return jsonify({
            'success': False,
            'error': 'please wait a moment before sending more feedback',
        }), 429

    # Screenshot — optional, validated before any DB write
    screenshot_bytes = None
    screenshot_mime = None
    screenshot_ext = None
    if file_obj and file_obj.filename:
        # Read full bytes (Flask uses SpooledTemporaryFile so this is fine for <=5MB).
        screenshot_bytes = file_obj.read()
        if len(screenshot_bytes) == 0:
            screenshot_bytes = None  # treat empty upload as no upload
        elif len(screenshot_bytes) > MAX_SCREENSHOT_BYTES:
            return jsonify({
                'success': False,
                'error': f'screenshot too large (max {MAX_SCREENSHOT_BYTES // (1024*1024)} MB)',
            }), 400
        else:
            mime, ext = _detect_image(screenshot_bytes[:32], file_obj.mimetype or '')
            if not mime:
                return jsonify({
                    'success': False,
                    'error': 'screenshot must be a PNG, JPEG, WebP, or GIF image',
                }), 400
            screenshot_mime = mime
            screenshot_ext = ext

    # Insert row first so we have an id for the filename
    now = _now().isoformat()
    with _conn() as c:
        cur = c.execute(
            'INSERT INTO feedback '
            '(email, message, is_read, created_at, updated_at, rating, tag, screenshot_path, screenshot_mime) '
            'VALUES (?, ?, 0, ?, ?, ?, ?, NULL, NULL)',
            (email, message, now, now, rating, tag),
        )
        feedback_id = cur.lastrowid

    # Write screenshot to disk (after row insert so the id is stable)
    if screenshot_bytes is not None:
        rel_path = f'{feedback_id}-{secrets.token_hex(4)}.{screenshot_ext}'
        full_path = os.path.join(UPLOAD_DIR, rel_path)
        try:
            with open(full_path, 'wb') as f:
                f.write(screenshot_bytes)
        except OSError as exc:
            logger.warning('Could not write screenshot for id=%s: %s', feedback_id, exc)
            # Row is already inserted; just skip the screenshot rather than fail the whole thing.
        else:
            with _conn() as c:
                c.execute(
                    'UPDATE feedback SET screenshot_path=?, screenshot_mime=? WHERE id=?',
                    (rel_path, screenshot_mime, feedback_id),
                )

    return jsonify({'success': True, 'id': feedback_id}), 201


# ─── Admin endpoints ────────────────────────────────────────
@require_admin
def list_feedback():
    status = (request.args.get('status') or 'all').strip().lower()
    tag = (request.args.get('tag') or '').strip().lower()
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(100, int(request.args.get('per_page', 25))))
    except (TypeError, ValueError):
        page, per_page = 1, 25

    where_clauses = []
    params = []

    if status == 'new':
        where_clauses.append('is_read = 0')
    elif status == 'read':
        where_clauses.append('is_read = 1')
    elif status not in ('all', ''):
        return jsonify({'success': False, 'error': 'invalid status filter'}), 400

    if tag:
        if tag not in ALLOWED_TAGS:
            return jsonify({'success': False, 'error': 'invalid tag filter'}), 400
        where_clauses.append('lower(tag) = ?')
        params.append(tag)

    where_sql = ('WHERE ' + ' AND '.join(where_clauses)) if where_clauses else ''
    offset = (page - 1) * per_page

    with _conn() as c:
        total = c.execute(
            f'SELECT COUNT(*) AS n FROM feedback {where_sql}', tuple(params),
        ).fetchone()['n']
        rows = c.execute(
            f'SELECT id, email, message, is_read, created_at, updated_at, '
            f'rating, tag, screenshot_path, screenshot_mime '
            f'FROM feedback {where_sql} '
            f'ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?',
            tuple(params) + (per_page, offset),
        ).fetchall()
        unread = c.execute('SELECT COUNT(*) AS n FROM feedback WHERE is_read = 0').fetchone()['n']
        read_total = c.execute('SELECT COUNT(*) AS n FROM feedback WHERE is_read = 1').fetchone()['n']

    return jsonify({
        'items': [_row_to_dict(dict(r)) for r in rows],
        'total': int(total),
        'page': page,
        'per_page': per_page,
        'counts': {
            'new': int(unread),
            'read': int(read_total),
        },
    })


@require_admin
def feedback_unread_count():
    with _conn() as c:
        row = c.execute('SELECT COUNT(*) AS n FROM feedback WHERE is_read = 0').fetchone()
    return jsonify({'count': int(row['n']) if row else 0})


@require_admin
def set_feedback_read(item_id):
    data = request.get_json(silent=True) or {}
    if 'is_read' not in data:
        return jsonify({'success': False, 'error': 'is_read is required'}), 400
    is_read = 1 if bool(data.get('is_read')) else 0

    now = _now().isoformat()
    with _conn() as c:
        row = c.execute('SELECT id FROM feedback WHERE id=?', (item_id,)).fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'feedback not found'}), 404
        c.execute(
            'UPDATE feedback SET is_read=?, updated_at=? WHERE id=?',
            (is_read, now, item_id),
        )
        updated = c.execute(
            'SELECT id, email, message, is_read, created_at, updated_at, '
            'rating, tag, screenshot_path, screenshot_mime '
            'FROM feedback WHERE id=?',
            (item_id,),
        ).fetchone()

    return jsonify({'success': True, 'item': _row_to_dict(dict(updated))})


@require_admin
def delete_feedback(item_id):
    with _conn() as c:
        row = c.execute(
            'SELECT id, screenshot_path FROM feedback WHERE id=?', (item_id,),
        ).fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'feedback not found'}), 404
        c.execute('DELETE FROM feedback WHERE id=?', (item_id,))
    # Cleanup screenshot file
    _delete_screenshot(row['screenshot_path'])
    return jsonify({'success': True})


@require_admin
def get_feedback_screenshot(item_id):
    with _conn() as c:
        row = c.execute(
            'SELECT screenshot_path, screenshot_mime FROM feedback WHERE id=?', (item_id,),
        ).fetchone()
    if not row or not row['screenshot_path']:
        abort(404)

    rel = row['screenshot_path']
    full = os.path.join(UPLOAD_DIR, rel)
    # Path-traversal guard
    if not os.path.abspath(full).startswith(os.path.abspath(UPLOAD_DIR)):
        abort(404)
    if not os.path.exists(full):
        abort(404)

    return send_file(full, mimetype=row['screenshot_mime'] or 'application/octet-stream')


# ─── Registration ───────────────────────────────────────────
def register_routes(app):
    app.add_url_rule('/api/feedback',
                     view_func=submit_feedback, methods=['POST'])
    app.add_url_rule('/api/admin/feedback',
                     view_func=list_feedback, methods=['GET'])
    app.add_url_rule('/api/admin/feedback/unread-count',
                     view_func=feedback_unread_count, methods=['GET'])
    app.add_url_rule('/api/admin/feedback/<int:item_id>',
                     view_func=set_feedback_read, methods=['PATCH'])
    app.add_url_rule('/api/admin/feedback/<int:item_id>',
                     view_func=delete_feedback, methods=['DELETE'])
    app.add_url_rule('/api/admin/feedback/<int:item_id>/screenshot',
                     view_func=get_feedback_screenshot, methods=['GET'])
