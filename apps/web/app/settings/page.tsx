'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { apiRequest, notifyGlobalError, notifyGlobalSuccess } from '../../lib/api-client';
import { getPasswordStrength } from '../../lib/password-strength';

export default function SettingsPage() {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState({ current: false, new: false, confirm: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncJob, setSyncJob] = useState<{ id: string; kind: 'master-data' | 'applications' | 'findings'; status: string; progress: number; message: string; error?: string; result?: Record<string, unknown> } | null>(null);

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = oldPassword && newPassword && confirmPassword && passwordsMatch && strength.score >= 2 && !isSubmitting;

  useEffect(() => {
    if (!syncJob || !['queued', 'running'].includes(syncJob.status)) return;
    const poll = async () => {
      try {
        const job = await apiRequest<typeof syncJob>(`/sync/${syncJob.id}`);
        setSyncJob(job);
        if (job.status === 'completed') notifyGlobalSuccess(job.message);
        if (job.status === 'failed') notifyGlobalError(job.error ?? job.message);
      } catch (error) {
        notifyGlobalError(error instanceof Error ? error.message : 'Unable to read synchronization progress.');
      }
    };
    const timer = window.setInterval(() => void poll(), 1000);
    void poll();
    return () => window.clearInterval(timer);
  }, [syncJob?.id, syncJob?.status]);

  async function startSync(kind: 'master-data' | 'applications' | 'findings') {
    if (syncJob && ['queued', 'running'].includes(syncJob.status)) return;
    try {
      const job = await apiRequest<typeof syncJob>(`/sync/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      setSyncJob(job);
    } catch (error) {
      notifyGlobalError(error instanceof Error ? error.message : 'Unable to start synchronization.');
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordsMatch) {
      notifyGlobalError('New password and confirm password must match.');
      return;
    }

    if (strength.score < 2) {
      notifyGlobalError('Password is too weak. Use a stronger combination of letters, numbers, and symbols.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: oldPassword, newPassword, confirmPassword }),
      }, { retryOnUnauthorized: false });
      notifyGlobalSuccess('Password updated. Your session has been reset for security. Redirecting to sign in...');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      window.setTimeout(() => {
        window.location.assign('/login');
      }, 1600);
    } catch (submitError) {
      notifyGlobalError(submitError instanceof Error ? submitError.message : 'Unable to change password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell>
      <main className="cyber-page cyber-settings min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 rounded-2xl border border-cyan-400/20 bg-slate-900/80 p-6 shadow-[0_0_40px_rgba(34,211,238,0.08)]">
            <p className="text-[10px] uppercase tracking-[0.32em] text-cyan-300">Security</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Account password</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-400">Update your sign-in credentials and force a clean re-authentication across all active sessions.</p>
          </div>

          <form onSubmit={handleSubmit} className="rounded-2xl border border-violet-400/20 bg-[#0a1220]/90 p-6 shadow-[0_0_50px_rgba(168,85,247,0.08)] sm:p-8">
            <div className="grid gap-6">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Current password</span>
                <div className="relative">
                <input
                  type={visiblePasswords.current ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  onPaste={(event) => event.preventDefault()}
                  required
                  className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 pr-16 text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-500/20"
                />
                <button type="button" onClick={() => setVisiblePasswords((current) => ({ ...current, current: !current.current }))} aria-label={visiblePasswords.current ? 'Hide password' : 'Show password'} title={visiblePasswords.current ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-2 my-1 border-l border-slate-700 px-3 text-xs uppercase tracking-[0.12em] text-cyan-200 transition hover:text-cyan-100">{visiblePasswords.current ? 'Hide' : 'Show'}</button>
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">New password</span>
                <div className="relative">
                <input
                  type={visiblePasswords.new ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  onPaste={(event) => event.preventDefault()}
                  required
                  minLength={12}
                  maxLength={128}
                  className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 pr-16 text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-500/20"
                />
                <button type="button" onClick={() => setVisiblePasswords((current) => ({ ...current, new: !current.new }))} aria-label={visiblePasswords.new ? 'Hide password' : 'Show password'} title={visiblePasswords.new ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-2 my-1 border-l border-slate-700 px-3 text-xs uppercase tracking-[0.12em] text-cyan-200 transition hover:text-cyan-100">{visiblePasswords.new ? 'Hide' : 'Show'}</button>
                </div>
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  <span>Password strength</span>
                  <span className="text-cyan-300">{strength.label}</span>
                </div>
                <div className="h-2.5 overflow-hidden bg-slate-800">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${strength.percentage}%`, backgroundColor: strength.tone }}
                  />
                </div>
                <p className="text-xs text-slate-400">{strength.message}</p>
              </div>

              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-slate-400">Confirm password</span>
                <div className="relative">
                <input
                  type={visiblePasswords.confirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  onPaste={(event) => event.preventDefault()}
                  required
                  minLength={12}
                  maxLength={128}
                  className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-4 pr-16 text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-500/20"
                />
                <button type="button" onClick={() => setVisiblePasswords((current) => ({ ...current, confirm: !current.confirm }))} aria-label={visiblePasswords.confirm ? 'Hide password' : 'Show password'} title={visiblePasswords.confirm ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-2 my-1 border-l border-slate-700 px-3 text-xs uppercase tracking-[0.12em] text-cyan-200 transition hover:text-cyan-100">{visiblePasswords.confirm ? 'Hide' : 'Show'}</button>
                </div>
                {confirmPassword ? (
                  <span className={`mt-2 block text-xs ${passwordsMatch ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {passwordsMatch ? 'Passwords match.' : 'Passwords do not match.'}
                  </span>
                ) : null}
              </label>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-8 flex w-full items-center justify-center rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {isSubmitting ? 'Updating password...' : 'Save password'}
            </button>
          </form>

          <section className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-5 border border-cyan-400/20 bg-slate-900/80 p-5">
              <div><p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Synchronization</p><h2 className="text-xl font-semibold text-white">Master data</h2></div>
              <p className="mt-2 text-sm text-slate-400">Master document synchronization is reserved for a later release.</p>
              <button type="button" onClick={() => void startSync('master-data')} disabled={Boolean(syncJob && ['queued', 'running'].includes(syncJob.status))} className="mt-auto w-full border border-cyan-300/40 bg-cyan-300/10 px-4 py-3 pt-3 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40">Sync master data</button>
            </div>
            <div className="flex flex-col gap-5 border border-emerald-400/20 bg-slate-900/80 p-5">
              <div><p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300">Synchronization</p><h2 className="text-xl font-semibold text-white">Applications</h2></div>
              <p className="mt-2 text-sm text-slate-400">Run the same application endpoint health check used by the scheduled job.</p>
              <button type="button" onClick={() => void startSync('applications')} disabled={Boolean(syncJob && ['queued', 'running'].includes(syncJob.status))} className="mt-auto w-full border border-emerald-300/40 bg-emerald-300/10 px-4 py-3 pt-3 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-40">Sync applications</button>
            </div>
            <div className="flex flex-col gap-5 border border-amber-400/20 bg-slate-900/80 p-5">
              <div><p className="text-[10px] uppercase tracking-[0.22em] text-amber-300">Synchronization</p><h2 className="text-xl font-semibold text-white">Findings</h2></div>
              <p className="mt-2 text-sm text-slate-400">Refresh vulnerability data and enrich findings using the scheduled CVE workflow.</p>
              <button type="button" onClick={() => void startSync('findings')} disabled={Boolean(syncJob && ['queued', 'running'].includes(syncJob.status))} className="mt-auto w-full border border-amber-300/40 bg-amber-300/10 px-4 py-3 pt-3 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-40">Sync findings</button>
            </div>
          </section>
        </div>
        {syncJob ? <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-5 backdrop-blur-sm"><div className="w-full max-w-lg border border-cyan-300/40 bg-[#08121f] p-6 shadow-[0_0_50px_rgba(103,232,249,0.18)]"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Live synchronization</p><h2 className="mt-2 text-xl font-semibold text-white">{syncJob.kind === 'applications' ? 'Applications' : syncJob.kind === 'master-data' ? 'Master data' : 'Findings'}</h2></div>{!['queued', 'running'].includes(syncJob.status) ? <button type="button" onClick={() => setSyncJob(null)} aria-label="Close synchronization status" className="text-lg text-slate-300 hover:text-white">×</button> : null}</div><p className="mt-4 text-sm text-slate-400">{syncJob.message}</p><div className="mt-5 h-3 overflow-hidden bg-slate-800"><div className="h-full bg-cyan-300 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, syncJob.progress))}%` }} /></div><div className="mt-2 flex justify-between text-xs uppercase tracking-[0.14em] text-slate-500"><span>{syncJob.status}</span><span>{syncJob.progress}%</span></div>{syncJob.status === 'completed' ? <button type="button" onClick={() => setSyncJob(null)} className="mt-6 w-full border border-emerald-300/40 bg-emerald-300/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100">Done</button> : null}{syncJob.status === 'failed' ? <button type="button" onClick={() => setSyncJob(null)} className="mt-6 w-full border border-rose-300/40 bg-rose-300/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-rose-100">Close</button> : null}</div></div> : null}
      </main>
    </AppShell>
  );
}
