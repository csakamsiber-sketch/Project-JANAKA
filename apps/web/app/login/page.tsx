'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { apiRequest, notifyGlobalError, notifyGlobalSuccess } from '../../lib/api-client';
import { getDeviceFingerprint } from '../../lib/fingerprint';
import { getPasswordStrength } from '../../lib/password-strength';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [temporaryAccessToken, setTemporaryAccessToken] = useState('');
  const [loginResendAvailableAt, setLoginResendAvailableAt] = useState<number | null>(null);
  const [loginResendSeconds, setLoginResendSeconds] = useState(0);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [botToken, setBotToken] = useState('');
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [globalError, setGlobalError] = useState<{ message: string; code: string; success?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [registration, setRegistration] = useState({ firstName: '', lastName: '', email: '', role: 'PIC' });
  const [isRegistering, setIsRegistering] = useState(false);
  const isLocalDevBypass = process.env.NODE_ENV !== 'production';
  const passwordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);
  const newPasswordMatches = newPassword.length > 0 && newPassword === confirmNewPassword;
  const canSubmitNewPassword = Boolean(newPassword) && Boolean(confirmNewPassword) && newPasswordMatches && passwordStrength.score >= 2 && !isSubmitting;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleApiError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; code?: string }>).detail;
      setGlobalError({ message: detail?.message || 'An unexpected error occurred. Please try again.', code: detail?.code || 'REQUEST_FAILED' });
    };
    const handleApiSuccess = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; code?: string }>).detail;
      setGlobalError({ message: detail?.message || 'Operation completed successfully.', code: detail?.code || 'SUCCESS', success: true });
    };
    window.addEventListener('janus:api-error', handleApiError);
    window.addEventListener('janus:api-success', handleApiSuccess);
    return () => { window.removeEventListener('janus:api-error', handleApiError); window.removeEventListener('janus:api-success', handleApiSuccess); };
  }, []);

  useEffect(() => {
    if (!globalError) return;
    const timer = window.setTimeout(() => setGlobalError(null), 1500);
    return () => window.clearTimeout(timer);
  }, [globalError]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = forcePasswordChange ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [forcePasswordChange]);

  useEffect(() => {
    if (!loginResendAvailableAt) {
      setLoginResendSeconds(0);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((loginResendAvailableAt - Date.now()) / 1000));
      setLoginResendSeconds(remaining);
      if (remaining === 0) setLoginResendAvailableAt(null);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [loginResendAvailableAt]);

  function showError(message: string) {
    notifyGlobalError(message);
  }

  function isLocalDevBypassEnabled() {
    return isLocalDevBypass;
  }

  const canSubmit = !isSubmitting && (Boolean(botToken) || isLocalDevBypass);
  const isSubmitDisabled = !mounted ? false : !canSubmit;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const fingerprint = await getDeviceFingerprint();
      const finalBotToken = botToken || (isLocalDevBypassEnabled() ? 'local-dev-bypass' : '');
      const result = await apiRequest<{ accessToken?: string; requiresOtp?: boolean; challengeId?: string; temporaryAccessToken?: string; user?: { mustChangePassword?: boolean } }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fingerprint, botToken: finalBotToken, ...(otp ? { otp } : {}), ...(challengeId ? { challengeId } : {}), ...(temporaryAccessToken ? { temporaryAccessToken } : {}) }),
      }, { retryOnUnauthorized: false });
      if (result.requiresOtp && result.challengeId) {
        setChallengeId(result.challengeId);
        setTemporaryAccessToken(result.temporaryAccessToken ?? '');
        setOtp('');
        setLoginResendAvailableAt(Date.now() + 2 * 60 * 1000);
        notifyGlobalSuccess('A verification code was sent to your email.');
        return;
      }
      if (result.user?.mustChangePassword) {
        setForcePasswordChange(true);
        setNewPassword('');
        setConfirmNewPassword('');
        return;
      }
      router.replace('/dashboard');
      router.refresh();
      if (typeof window !== 'undefined') {
        window.location.assign('/dashboard');
      }
    } catch (loginError) {
      showError(loginError instanceof Error ? loginError.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendLoginOtp() {
    if (!challengeId || !temporaryAccessToken || loginResendSeconds > 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const fingerprint = await getDeviceFingerprint();
      const finalBotToken = botToken || (isLocalDevBypassEnabled() ? 'local-dev-bypass' : '');
      const result = await apiRequest<{ retryAfterSeconds: number }>('/auth/login/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, challengeId, temporaryAccessToken, fingerprint, botToken: finalBotToken }),
      }, { retryOnUnauthorized: false });
      setOtp('');
      setLoginResendAvailableAt(Date.now() + result.retryAfterSeconds * 1000);
      notifyGlobalSuccess(`A new verification code was sent. You can resend again in ${Math.ceil(result.retryAfterSeconds / 60)} minute(s).`);
    } catch (resendError) {
      showError(resendError instanceof Error ? resendError.message : 'Unable to resend verification code.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 12) {
      showError('New password must be at least 12 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showError('New password and confirmation password must match.');
      return;
    }
    if (passwordStrength.score < 2) {
      showError('Password is too weak. Use a stronger combination of letters, numbers, and symbols.');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: password, newPassword, confirmPassword: confirmNewPassword }),
      }, { retryOnUnauthorized: false });
      setForcePasswordChange(false);
      router.replace('/dashboard');
      router.refresh();
      if (typeof window !== 'undefined') {
        window.location.assign('/dashboard');
      }
    } catch (changeError) {
      showError(changeError instanceof Error ? changeError.message : 'Unable to change password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsRegistering(true);

    try {
      const result = await apiRequest<{ registrationRequestId: string; status: string }>('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registration),
      }, { retryOnUnauthorized: false });
      setRegistration({ firstName: '', lastName: '', email: '', role: 'PIC' });
      notifyGlobalSuccess(`Request ${result.status.toLowerCase()}. An administrator will review your access.`);
    } catch (registrationError) {
      notifyGlobalError(registrationError instanceof Error ? registrationError.message : 'Unable to submit registration request.');
    } finally {
      setIsRegistering(false);
    }
  }

  if (forcePasswordChange) {
    return (
      <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100 sm:px-8 lg:px-12">
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-5 backdrop-blur-sm" role="presentation">
          <form role="dialog" aria-modal="true" aria-labelledby="first-sign-in-checkpoint-title" onSubmit={handleChangePassword} className="w-full max-w-md rounded-2xl border border-amber-300/30 bg-[#08121f] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-amber-300">First sign-in checkpoint</p>
                <h2 id="first-sign-in-checkpoint-title" className="mt-2 text-2xl font-semibold text-white">Change temporary password</h2>
              </div>
              <button type="button" onClick={() => setForcePasswordChange(false)} aria-label="Close password change modal" className="text-xl text-slate-400 transition hover:text-white">×</button>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">Your temporary password must be replaced before accessing the workspace.</p>
            <label className="mt-5 block"><span className="field-label">New password</span><div className="relative mt-2"><input autoFocus required type={showNewPassword ? 'text' : 'password'} minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} onPaste={(event) => event.preventDefault()} className="field-input h-12 w-full pr-16" /><button type="button" onClick={() => setShowNewPassword((visible) => !visible)} aria-label={showNewPassword ? 'Hide password' : 'Show password'} title={showNewPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-2 my-1 border-l border-slate-700 px-3 text-xs uppercase tracking-[0.12em] text-amber-200 transition hover:text-amber-100">{showNewPassword ? 'Hide' : 'Show'}</button></div></label>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-400"><span>Password strength</span><span style={{ color: passwordStrength.tone }}>{passwordStrength.label}</span></div>
              <div className="h-2.5 overflow-hidden bg-slate-800"><div className="h-full transition-all duration-300" style={{ width: `${passwordStrength.percentage}%`, backgroundColor: passwordStrength.tone }} /></div>
              <p className="text-xs text-slate-400">{passwordStrength.message}</p>
            </div>
            <label className="mt-4 block"><span className="field-label">Confirm new password</span><div className="relative mt-2"><input required type={showConfirmNewPassword ? 'text' : 'password'} minLength={12} maxLength={128} value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} onPaste={(event) => event.preventDefault()} className="field-input h-12 w-full pr-16" aria-invalid={Boolean(confirmNewPassword) && !newPasswordMatches} /><button type="button" onClick={() => setShowConfirmNewPassword((visible) => !visible)} aria-label={showConfirmNewPassword ? 'Hide password' : 'Show password'} title={showConfirmNewPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-2 my-1 border-l border-slate-700 px-3 text-xs uppercase tracking-[0.12em] text-amber-200 transition hover:text-amber-100">{showConfirmNewPassword ? 'Hide' : 'Show'}</button></div></label>
            {confirmNewPassword ? <p className={`mt-3 text-xs ${newPasswordMatches ? 'text-emerald-300' : 'text-rose-300'}`}>{newPasswordMatches ? 'Passwords match.' : 'Passwords do not match.'}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setForcePasswordChange(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white">Cancel</button>
              <button type="submit" disabled={!canSubmitNewPassword} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">{isSubmitting ? 'Updating...' : 'Update password'}</button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="login-shell min-h-screen px-5 py-8 text-slate-100 sm:px-8 lg:px-12">
      {globalError ? <div role="alert" className="fixed inset-x-0 top-0 z-[100] flex justify-center px-4 pt-3"><div className={`flex w-full max-w-3xl items-start justify-between gap-4 border px-4 py-3 text-sm backdrop-blur-md ${globalError.success ? 'border-emerald-300/50 bg-[#06251c]/95 text-emerald-100 shadow-[0_0_30px_rgba(52,211,153,0.24)]' : 'border-rose-300/50 bg-[#240d16]/95 text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.28)]'}`}><div><p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${globalError.success ? 'text-emerald-300' : 'text-rose-300'}`}>{globalError.code}</p><p className="mt-1">{globalError.message}</p></div><button type="button" aria-label="Dismiss notification" onClick={() => setGlobalError(null)} className={`text-lg leading-none ${globalError.success ? 'text-emerald-200 hover:text-white' : 'text-rose-200 hover:text-white'}`}>×</button></div></div> : null}
      <div className="mx-auto max-w-7xl">
        <header className="mb-10 flex items-end justify-between border-b border-cyan-300/15 pb-5">
          <div>
            <div className="mb-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.32em] text-cyan-300"><span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.9)]" /> JAMUS KALIMASADA / CONTROL PLANE</div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">JAMUS KALIMASADA</h1>
          </div>
          <div className="hidden text-right text-[10px] uppercase tracking-[0.22em] text-slate-500 sm:block">Identity gateway<br /><span className="text-emerald-300">Operational</span></div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <section className="login-card cyber-panel rounded-2xl p-6 sm:p-9">
            <div className="mb-8 flex items-start justify-between gap-4">
              <div><p className="text-[10px] uppercase tracking-[0.24em] text-pink-300">Existing operator</p><h2 className="mt-2 text-2xl font-semibold text-white">Sign in</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">Continue to application assurance, verification schedules, and threat intelligence.</p></div>
              <span className="rounded-full border border-cyan-300/25 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-cyan-200">01 / 02</span>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <label><span className="field-label">Email address</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                minLength={6}
                maxLength={254}
                className="field-input h-12"
              />
              </label>
              {challengeId ? (
                <label><span className="field-label">Email verification code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  minLength={6}
                  maxLength={6}
                  className="field-input h-12"
                />
                <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{loginResendSeconds > 0 ? `Resend available in ${Math.floor(loginResendSeconds / 60)}:${String(loginResendSeconds % 60).padStart(2, '0')}` : 'Code not received?'}</span><button type="button" onClick={resendLoginOtp} disabled={loginResendSeconds > 0 || isSubmitting || (!isLocalDevBypass && !botToken)} className="text-cyan-200 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40">Resend code</button></div>
                </label>
              ) : null}
              {!isLocalDevBypass ? <Turnstile ref={turnstileRef} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''} onSuccess={setBotToken} onExpire={() => setBotToken('')} /> : null}
              <label><span className="field-label">Password</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onPaste={(event) => event.preventDefault()}
                  required
                  minLength={12}
                  maxLength={128}
                  className="field-input h-12 pr-16"
                />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-2 my-1 border-l border-slate-700 px-3 text-xs uppercase tracking-[0.12em] text-cyan-200 transition hover:text-cyan-100">
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              </label>

            <button type="submit" disabled={isSubmitDisabled} className="cyber-button flex h-12 w-full items-center justify-between rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">
              <span>{isSubmitting ? 'Authenticating...' : 'Enter workspace'}</span><span className="text-cyan-300">↗</span>
            </button>
          </form>

          </section>

          <section className="register-card rounded-2xl border border-violet-300/20 bg-violet-300/[0.045] p-6 shadow-[0_0_55px_rgba(167,139,250,0.08)] sm:p-9">
            <div className="mb-7 flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.24em] text-violet-300">New operator</p><h2 className="mt-2 text-2xl font-semibold text-white">Request access</h2><p className="mt-2 text-sm leading-6 text-slate-400">Create a registration request for administrator review.</p></div><span className="rounded-full border border-violet-300/25 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-violet-200">02 / 02</span></div>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleRegistration}>
              <label><span className="field-label">First name</span><input required minLength={2} maxLength={80} value={registration.firstName} onChange={(event) => setRegistration((current) => ({ ...current, firstName: event.target.value }))} className="field-input h-11" /></label>
              <label><span className="field-label">Last name</span><input required minLength={2} maxLength={80} value={registration.lastName} onChange={(event) => setRegistration((current) => ({ ...current, lastName: event.target.value }))} className="field-input h-11" /></label>
              <label className="sm:col-span-2"><span className="field-label">Work email</span><input type="email" required maxLength={254} value={registration.email} onChange={(event) => setRegistration((current) => ({ ...current, email: event.target.value }))} className="field-input h-11" /></label>
              <label><span className="field-label">Requested role</span><select value={registration.role} onChange={(event) => setRegistration((current) => ({ ...current, role: event.target.value }))} className="field-input h-11"><option value="PIC">PIC</option><option value="VERIFICATOR">Verificator</option><option value="OVERSEER">Overseer</option></select></label>
              <div className="sm:col-span-2 text-[11px] leading-5 text-slate-500">After approval, a temporary password will be sent to this email address.</div>
              <button type="submit" disabled={isRegistering} className="sm:col-span-2 flex h-11 items-center justify-between rounded-lg border border-violet-300/35 bg-violet-300/10 px-4 text-sm font-semibold text-violet-100 transition hover:border-violet-200/60 hover:bg-violet-300/15 disabled:cursor-not-allowed disabled:opacity-50"><span>{isRegistering ? 'Submitting request...' : 'Submit access request'}</span><span className="text-violet-300">＋</span></button>
            </form>
          </section>
        </div>
      </div>
      {forcePasswordChange ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-5 backdrop-blur-sm" role="presentation"><form role="dialog" aria-modal="true" aria-labelledby="first-sign-in-checkpoint-title" onSubmit={handleChangePassword} className="w-full max-w-md rounded-2xl border border-amber-300/30 bg-[#08121f] p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-amber-300">First sign-in checkpoint</p><h2 id="first-sign-in-checkpoint-title" className="mt-2 text-2xl font-semibold text-white">Change temporary password</h2></div><button type="button" onClick={() => setForcePasswordChange(false)} aria-label="Close password change modal" className="text-xl text-slate-400 transition hover:text-white">×</button></div><p className="mt-3 text-sm leading-6 text-slate-400">Your temporary password must be replaced before accessing the workspace.</p><label className="mt-5 block"><span className="field-label">New password</span><div className="relative mt-2"><input autoFocus required type={showNewPassword ? 'text' : 'password'} minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} onPaste={(event) => event.preventDefault()} className="field-input h-12 w-full pr-16" /><button type="button" onClick={() => setShowNewPassword((visible) => !visible)} aria-label={showNewPassword ? 'Hide password' : 'Show password'} title={showNewPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-2 my-1 border-l border-slate-700 px-3 text-xs uppercase tracking-[0.12em] text-amber-200 transition hover:text-amber-100">{showNewPassword ? 'Hide' : 'Show'}</button></div></label><div className="mt-4 space-y-3"><div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-400"><span>Password strength</span><span style={{ color: passwordStrength.tone }}>{passwordStrength.label}</span></div><div className="h-2.5 overflow-hidden bg-slate-800"><div className="h-full transition-all duration-300" style={{ width: `${passwordStrength.percentage}%`, backgroundColor: passwordStrength.tone }} /></div><p className="text-xs text-slate-400">{passwordStrength.message}</p></div><label className="mt-4 block"><span className="field-label">Confirm new password</span><div className="relative mt-2"><input required type={showConfirmNewPassword ? 'text' : 'password'} minLength={12} maxLength={128} value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} onPaste={(event) => event.preventDefault()} className="field-input h-12 w-full pr-16" aria-invalid={Boolean(confirmNewPassword) && !newPasswordMatches} /><button type="button" onClick={() => setShowConfirmNewPassword((visible) => !visible)} aria-label={showConfirmNewPassword ? 'Hide password' : 'Show password'} title={showConfirmNewPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-2 my-1 border-l border-slate-700 px-3 text-xs uppercase tracking-[0.12em] text-amber-200 transition hover:text-amber-100">{showConfirmNewPassword ? 'Hide' : 'Show'}</button></div></label>{confirmNewPassword ? <p className={`mt-3 text-xs ${newPasswordMatches ? 'text-emerald-300' : 'text-rose-300'}`}>{newPasswordMatches ? 'Passwords match.' : 'Passwords do not match.'}</p> : null}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setForcePasswordChange(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white">Cancel</button><button type="submit" disabled={!canSubmitNewPassword} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">{isSubmitting ? 'Updating...' : 'Update password'}</button></div></form></div> : null}
    </main>
  );
}
