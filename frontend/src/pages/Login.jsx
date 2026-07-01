import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout.jsx';
import EmailInput from '../components/auth/EmailInput.jsx';
import PasswordInput from '../components/auth/PasswordInput.jsx';
import SubmitButton from '../components/auth/SubmitButton.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../components/ui/Toast.jsx';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e?.preventDefault();
    if (busy) return;
    if (!email || !password) {
      toast.error('Enter your email and password');
      return;
    }
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
      toast.success('Welcome back');
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err?.body?.needs_verification) {
        toast.error('Please verify your email first. Sign up again to receive a new code.');
        navigate('/signup', { state: { prefillEmail: email } });
        return;
      }
      toast.error(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      greeting="Hello!"
      sub="Sign in to continue to your workspace."
      footerNote={
        <div className="flex items-center justify-between">
          <Link to="/forgot-password" className="text-ink font-semibold hover:underline">
            Forgot Password
          </Link>
          <Link to="/signup" className="text-blue font-semibold hover:underline">
            Create account
          </Link>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <EmailInput value={email} onChange={setEmail} autoFocus disabled={busy} />
        <PasswordInput
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          onEnter={onSubmit}
        />
        <SubmitButton loading={busy}>Login</SubmitButton>
      </form>
    </AuthLayout>
  );
}
