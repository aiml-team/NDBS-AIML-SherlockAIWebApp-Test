import { useEffect, useState } from 'react';
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

export default function Signup() {
  const { signupRequest, signupVerify } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState(location.state?.prefillEmail || '');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);
  const [resendAt, setResendAt] = useState(null);

  useEffect(() => {
    if (location.state?.prefillEmail) setEmail(location.state.prefillEmail);
  }, [location.state]);

  async function onRequest(e) {
    e?.preventDefault();
    if (busy) return;
    const e1 = email.trim().toLowerCase();
    if (!e1) return toast.error('Enter your work email');
    if (password.length < 8) return toast.error('Password must be at least 8 characters');
    if (password !== confirmPw) return toast.error('Passwords do not match');

    setBusy(true);
    try {
      await signupRequest(e1, password);
      setEmail(e1);
      setStep(2);
      setOtp('');
      setExpiresAt(Date.now() + OTP_TTL_MS);
      setResendAt(Date.now() + RESEND_COOLDOWN_MS);
      toast.success('Verification code sent — check your inbox');
    } catch (err) {
      toast.error(err.message || 'Sign up failed');
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(otpValue) {
    if (busy) return;
    const v = otpValue || otp;
    if (!/^\d{6}$/.test(v)) return toast.error('Enter the 6-digit code');
    setBusy(true);
    try {
      await signupVerify(email, v);
      toast.success('Account verified');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (resending || (resendAt && Date.now() < resendAt)) return;
    setResending(true);
    try {
      await signupRequest(email, password);
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

  if (step === 1) {
    return (
      <AuthLayout
        greeting="Hello!"
        sub="Sign Up to Get Started."
        footerNote={
          <span>
            Already have an account?{' '}
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
            hint="Only @nttdata.com and @bs.nttdata.com accounts can sign up."
          />
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="Password"
            autoComplete="new-password"
            showStrength
          />
          <PasswordInput
            value={confirmPw}
            onChange={setConfirmPw}
            placeholder="Confirm password"
            autoComplete="new-password"
            onEnter={onRequest}
            hint={confirmPw && confirmPw !== password ? 'Passwords do not match yet.' : null}
          />
          <SubmitButton loading={busy}>Send verification code</SubmitButton>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      greeting="Check your inbox"
      sub={<>We sent a 6-digit code to <span className="text-ink font-semibold">{email}</span>.</>}
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
      <div className="flex flex-col gap-4">
        <OtpStatus
          expiresAt={expiresAt}
          resendAt={resendAt}
          onResend={onResend}
          resending={resending}
        />
        <OtpInput value={otp} onChange={setOtp} onComplete={onVerify} />
        <SubmitButton onClick={() => onVerify()} loading={busy}>
          Verify &amp; continue
        </SubmitButton>
      </div>
    </AuthLayout>
  );
}
