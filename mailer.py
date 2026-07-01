"""Minimal email sender. Uses SMTP if configured, otherwise logs the message
so developers can read OTPs straight off the Flask console."""
import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger('sherlock-web.mailer')


def _smtp_configured():
    return bool(os.environ.get('SMTP_HOST')) and bool(os.environ.get('MAIL_FROM'))


def send_email(to, subject, body):
    """Returns True on success. Falls back to logging when SMTP isn't set up
    (useful in dev so OTPs are still readable)."""
    if not _smtp_configured():
        logger.warning(
            '[DEV-MAIL] To: %s | Subject: %s\n%s\n',
            to, subject, body,
        )
        return True

    host = os.environ['SMTP_HOST']
    port = int(os.environ.get('SMTP_PORT', '587'))
    user = os.environ.get('SMTP_USER', '')
    pw = os.environ.get('SMTP_PASS', '')
    sender = os.environ['MAIL_FROM']
    use_tls = os.environ.get('SMTP_USE_TLS', 'true').lower() in ('1', 'true', 'yes')

    msg = EmailMessage()
    msg['From'] = sender
    msg['To'] = to
    msg['Subject'] = subject
    msg.set_content(body)

    try:
        with smtplib.SMTP(host, port, timeout=15) as smtp:
            smtp.ehlo()
            if use_tls:
                smtp.starttls()
                smtp.ehlo()
            if user and pw:
                smtp.login(user, pw)
            smtp.send_message(msg)
        logger.info('Sent email to %s (subject: %s)', to, subject)
        return True
    except Exception:
        logger.exception('Failed to send email to %s', to)
        return False
