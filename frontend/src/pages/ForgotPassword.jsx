import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import EmailInput from '../components/auth/EmailInput.jsx';
import PasswordInput from '../components/auth/PasswordInput.jsx';
import OtpInput from '../components/auth/OtpInput.jsx';
import OtpStatus from '../components/auth/OtpStatus.jsx';
import SubmitButton from '../components/auth/SubmitButton.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/ui/Toast.jsx';

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;

export default function ForgotPassword() {
  const { forgotPassword, resetPassword } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState(location.state?.prefillEmail || '');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);
  const [resendAt, setResendAt] = useState(null);

  async function onRequest(e) {
    e?.preventDefault();
    if (busy) return;
    const e1 = email.trim().toLowerCase();
    if (!e1) return toast.error('Enter your work email');
    setBusy(true);
    try {
      await forgotPassword(e1);
      setEmail(e1);
      setStep(2);
      setOtp('');
      setExpiresAt(Date.now() + OTP_TTL_MS);
      setResendAt(Date.now() + RESEND_COOLDOWN_MS);
      toast.info('If an account exists for that email, a code has been sent.');
    } catch (err) {
      toast.error(err.message || 'Could not send code');
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (resending || (resendAt && Date.now() < resendAt)) return;
    setResending(true);
    try {
      await forgotPassword(email);
      setExpiresAt(Date.now() + OTP_TTL_MS);
      setResendAt(Date.now() + RESEND_COOLDOWN_MS);
      setOtp('');
      toast.success('New code sent');
    } catch (err) {
      toast.error(err.message || 'Could not resend code');
    } finally {
      setResending(false);
    }
  }

  async function onReset(e) {
    e?.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(otp)) return toast.error('Enter the 6-digit code');
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    if (password !== confirmPw) return toast.error('Passwords do not match');

    setBusy(true);
    try {
      await resetPassword(email, otp, password);
      toast.success('Password updated — you are signed in');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  if (step === 1) {
    return (
      <AuthLayout
        greeting="Forgot it?"
        sub="We'll email you a one-time code to reset your password."
        footerNote={
          <span>
            Remembered it?{' '}
            <Link to="/login" className="text-blue font-semibold hover:underline">Sign in</Link>
          </span>
        }
      >
        <form onSubmit={onRequest} className="flex flex-col gap-4">
          <EmailInput
            value={email}
            onChange={setEmail}
            autoFocus
            disabled={busy}
            hint="Only @nttdata.com and @bs.nttdata.com accounts can sign in."
          />
          <SubmitButton loading={busy}>Send reset code</SubmitButton>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      greeting="Reset password"
      sub={<>Enter the code we sent to <span className="text-ink font-semibold">{email}</span>, then your new password.</>}
      footerNote={
        <span>
          Wrong email?{' '}
          <button
            type="button"
            onClick={() => setStep(1)}
            className="text-blue font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer"
          >
            Go back
          </button>
        </span>
      }
    >
      <form onSubmit={onReset} className="flex flex-col gap-4">
        <OtpStatus
          expiresAt={expiresAt}
          resendAt={resendAt}
          onResend={onResend}
          resending={resending}
        />
        <OtpInput value={otp} onChange={setOtp} />
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder="New password"
          autoComplete="new-password"
          showStrength
        />
        <PasswordInput
          value={confirmPw}
          onChange={setConfirmPw}
          placeholder="Confirm new password"
          autoComplete="new-password"
          onEnter={onReset}
        />
        <SubmitButton loading={busy}>Update password &amp; sign in</SubmitButton>
      </form>
    </AuthLayout>
  );
}
