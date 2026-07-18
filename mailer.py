"""Email sender for Sherlock AI.

Uses SMTP if configured (Gmail, etc.); otherwise logs the message so developers
can read OTPs straight off the Flask console.

Deliverability notes:
- Sends multipart/alternative (plain-text + HTML) — spam filters penalize plain-only.
- Sets Message-ID, Date, Reply-To, List-Unsubscribe headers to look like real
  transactional mail (Gmail/Outlook heuristics check for these).
- Retries once on transient SMTP failures (SMTPServerDisconnected, timeout, 4xx).
- Returns a (bool, str) tuple: (success, error_reason). The route handler can
  surface a hint like "check your spam folder" to the user.
"""
import logging
import os
import smtplib
import socket
import ssl
import time
import uuid
from email.headerregistry import Address
from email.message import EmailMessage
from email.utils import formatdate, make_msgid, parseaddr

logger = logging.getLogger('sherlock-web.mailer')


def _smtp_configured():
    return bool(os.environ.get('SMTP_HOST')) and bool(os.environ.get('MAIL_FROM'))


def _parse_from(sender_raw):
    """Split 'Display Name <addr@x>' into (display, addr). Falls back gracefully."""
    display, addr = parseaddr(sender_raw)
    if not addr:
        # sender_raw was just 'foo@bar' with no display name
        return '', sender_raw
    return display, addr


def _sender_domain():
    """Domain to use for Message-ID (should match the From address)."""
    _, addr = _parse_from(os.environ.get('MAIL_FROM', ''))
    if '@' in addr:
        return addr.split('@', 1)[1]
    return 'localhost'


def _build_message(to, subject, text_body, html_body=None):
    """Build a multipart/alternative EmailMessage with deliverability-friendly headers."""
    sender_raw = os.environ['MAIL_FROM']
    display, addr = _parse_from(sender_raw)

    msg = EmailMessage()
    if display:
        # Use structured Address so non-ASCII display names are encoded correctly.
        local, _, domain = addr.partition('@')
        msg['From'] = Address(display_name=display, username=local, domain=domain)
    else:
        msg['From'] = addr
    msg['To'] = to
    msg['Subject'] = subject
    msg['Date'] = formatdate(localtime=True)
    msg['Message-ID'] = make_msgid(domain=_sender_domain())
    msg['Reply-To'] = os.environ.get('MAIL_REPLY_TO', addr)

    # Transactional / anti-abuse hints. Even for OTP mail these headers help
    # filters classify us as a legitimate transactional sender, not a bulk
    # marketing blast.
    msg['Auto-Submitted'] = 'auto-generated'
    msg['X-Auto-Response-Suppress'] = 'All'
    msg['X-Entity-Ref-ID'] = uuid.uuid4().hex  # unique per-message hint

    # RFC 8058 one-click unsubscribe — even for transactional mail, Gmail is
    # much friendlier when this exists. It's a no-op mailto for now.
    unsubscribe_mailto = os.environ.get('MAIL_UNSUBSCRIBE', f'mailto:{addr}?subject=unsubscribe')
    msg['List-Unsubscribe'] = f'<{unsubscribe_mailto}>'

    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype='html')
    return msg


# Transient errors we should retry once (network blip, 4xx greylisting).
_TRANSIENT = (
    smtplib.SMTPServerDisconnected,
    smtplib.SMTPConnectError,
    smtplib.SMTPHeloError,
    socket.timeout,
    TimeoutError,
    ConnectionError,
    OSError,
)


def _smtp_send(msg):
    """Actually push the message to the SMTP server. Raises on error."""
    host = os.environ['SMTP_HOST']
    port = int(os.environ.get('SMTP_PORT', '587'))
    user = os.environ.get('SMTP_USER', '')
    pw = os.environ.get('SMTP_PASS', '')
    use_tls = os.environ.get('SMTP_USE_TLS', 'true').lower() in ('1', 'true', 'yes')
    use_ssl = os.environ.get('SMTP_USE_SSL', 'false').lower() in ('1', 'true', 'yes')
    timeout = int(os.environ.get('SMTP_TIMEOUT', '20'))

    context = ssl.create_default_context()

    if use_ssl:
        smtp = smtplib.SMTP_SSL(host, port, timeout=timeout, context=context)
    else:
        smtp = smtplib.SMTP(host, port, timeout=timeout)

    try:
        smtp.ehlo()
        if use_tls and not use_ssl:
            smtp.starttls(context=context)
            smtp.ehlo()
        if user and pw:
            smtp.login(user, pw)
        smtp.send_message(msg)
    finally:
        try:
            smtp.quit()
        except Exception:
            smtp.close()


def send_email(to, subject, text_body, html_body=None):
    """Send an email. Returns True on success (kept for backwards compatibility).

    Falls back to logging when SMTP isn't configured — useful in dev so OTPs
    are still readable from app.log.
    """
    if not _smtp_configured():
        logger.warning(
            '[DEV-MAIL] To: %s | Subject: %s\n%s\n',
            to, subject, text_body,
        )
        return True

    msg = _build_message(to, subject, text_body, html_body)

    # Try once, retry once on transient error.
    last_error = None
    for attempt in (1, 2):
        try:
            _smtp_send(msg)
            logger.info(
                'Sent email to %s (subject=%r, attempt=%d, message_id=%s)',
                to, subject, attempt, msg['Message-ID'],
            )
            return True
        except smtplib.SMTPRecipientsRefused as e:
            logger.error('SMTP recipient refused for %s: %s', to, e.recipients)
            last_error = e
            break  # no point retrying — recipient rejected
        except smtplib.SMTPAuthenticationError as e:
            logger.error(
                'SMTP auth failed (check SMTP_USER / SMTP_PASS — for Gmail this '
                'MUST be a 16-char App Password, not your account password): %s', e,
            )
            last_error = e
            break  # no point retrying — auth won't fix itself
        except _TRANSIENT as e:
            logger.warning(
                'SMTP transient error on attempt %d for %s: %s (%s)',
                attempt, to, type(e).__name__, e,
            )
            last_error = e
            if attempt == 1:
                time.sleep(1.5)
                continue
        except Exception as e:
            logger.exception('SMTP unexpected error for %s: %s', to, e)
            last_error = e
            break

    logger.error(
        'Failed to send email to %s after retries — body below for manual recovery:\n'
        '[MAIL-BODY] Subject: %s\n%s',
        to, subject, text_body,
    )
    if last_error is not None:
        logger.error('Last SMTP error: %s: %s', type(last_error).__name__, last_error)
    return False
