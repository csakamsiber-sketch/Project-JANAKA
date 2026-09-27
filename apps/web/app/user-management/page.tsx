'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';

type User = { id: string; email: string; firstName?: string; lastName?: string; role: string; isActive: boolean; createdAt: string };
type Registration = { id: string; email: string; firstName: string; lastName: string; role: string; status: string; createdAt: string };
type Approval = { id: string; requestId: string; target: { id: string; email: string; firstName?: string; lastName?: string }; requestedBy: string; requestedRole: string; expiresAt: string };
type Action = { targetId: string; action: 'DEACTIVATE' | 'PROMOTE_ADMIN' } | { requestId: string; action: 'DOWNGRADE_SUPERADMIN' };

const roles = ['PIC', 'VERIFICATOR', 'OVERSEER', 'SUPERADMIN'];

function initials(firstName?: string, lastName?: string, email?: string): string {
  const value = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.trim();
  return value || email?.[0]?.toUpperCase() || '?';
}

function Pager({ page, totalPages, onPrevious, onNext }: { page: number; totalPages: number; onPrevious: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-800/80 pt-4 text-[11px] uppercase tracking-[0.14em] text-slate-500">
      <span>Page {String(page).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}</span>
      <div className="flex gap-2">
        <button type="button" onClick={onPrevious} disabled={page <= 1} className="pager-button">←</button>
        <button type="button" onClick={onNext} disabled={page >= totalPages} className="pager-button">→</button>
      </div>
    </div>
  );
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [registrationsPage, setRegistrationsPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [registrationsTotalPages, setRegistrationsTotalPages] = useState(1);
  const [action, setAction] = useState<Action | null>(null);
  const [code, setCode] = useState('');
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentRole, setCurrentRole] = useState<string>();
  const [loadingApprovals, setLoadingApprovals] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [userData, registrationData, currentUser] = await Promise.all([
        apiRequest<{ items: User[]; totalPages: number }>(`/auth/user-management/users?page=${usersPage}`),
        apiRequest<{ items: Registration[]; totalPages: number }>(`/auth/user-management/registrations?page=${registrationsPage}`),
        apiRequest<{ role?: string }>('/auth/me'),
      ]);
      setUsers(userData.items ?? []);
      setRegistrations(registrationData.items ?? []);
      setUsersTotalPages(userData.totalPages ?? 1);
      setRegistrationsTotalPages(registrationData.totalPages ?? 1);
      setCurrentRole(currentUser.role);
      setApprovals([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load user management data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [usersPage, registrationsPage]);

  async function loadApprovals() {
    if (currentRole !== 'SUPERADMIN') return;
    setLoadingApprovals(true);
    try {
      const approvalData = await apiRequest<Approval[]>('/auth/user-management/superadmin-downgrade-approvals');
      setApprovals(approvalData ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load superadmin approvals.');
    } finally {
      setLoadingApprovals(false);
    }
  }

  useEffect(() => {
    if (!resendAvailableAt) {
      setResendSeconds(0);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
      setResendSeconds(remaining);
      if (remaining === 0) setResendAvailableAt(null);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  async function approve(id: string) {
    try {
      await apiRequest('/auth/approve-registration', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: id }) });
      setMessage('Registration approved. Temporary credentials were sent by email.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to approve registration.'); }
  }

  async function reject(id: string) {
    try {
      await apiRequest(`/auth/user-management/registrations/${id}/reject`, { method: 'POST' });
      setMessage('Registration rejected.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to reject registration.'); }
  }

  async function requestAction(targetId: string, nextAction: 'DEACTIVATE' | 'PROMOTE_ADMIN') {
    try {
      await apiRequest('/auth/user-management/actions/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetId, action: nextAction }) });
      setAction({ targetId, action: nextAction });
      setCode('');
      setResendAvailableAt(Date.now() + 2 * 60 * 1000);
      setMessage('A verification code was sent to your administrator email.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to request verification code.'); }
  }

  async function resendAction() {
    if (!action || resendSeconds > 0) return;
    try {
      const path = action.action === 'DOWNGRADE_SUPERADMIN' ? `/auth/user-management/superadmin-downgrade-approvals/${action.requestId}/resend-otp` : '/auth/user-management/actions/resend-otp';
      const result = await apiRequest<{ retryAfterSeconds: number }>(path, { method: 'POST', ...(action.action === 'DOWNGRADE_SUPERADMIN' ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) }) });
      setCode('');
      setResendAvailableAt(Date.now() + result.retryAfterSeconds * 1000);
      setMessage(`A new verification code was sent. You can request another code in ${Math.ceil(result.retryAfterSeconds / 60)} minute(s).`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to resend verification code.'); }
  }

  async function requestDowngrade(targetId: string, role: string) {
    try {
      await apiRequest(`/auth/user-management/users/${targetId}/downgrade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
      setMessage('Downgrade request sent to every other active superadmin for approval.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to request superadmin downgrade.'); }
  }

  async function confirmAction() {
    if (!action) return;
    try {
      const endpoint = action.action === 'DOWNGRADE_SUPERADMIN' ? `/auth/user-management/superadmin-downgrade-approvals/${action.requestId}/confirm` : '/auth/user-management/actions/confirm';
      const body = action.action === 'DOWNGRADE_SUPERADMIN' ? { code } : { ...action, code };
      const result = await apiRequest<{ accepted?: boolean; completed?: boolean }>(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setAction(null);
      setCode('');
      setResendAvailableAt(null);
      setMessage(result.accepted && !result.completed ? 'Approval recorded. Waiting for the remaining superadmin approvals.' : 'User action completed.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to verify action.'); }
  }

  async function changeRole(targetId: string, role: string) {
    const current = users.find((user) => user.id === targetId);
    if (current?.role === 'SUPERADMIN' && role !== 'SUPERADMIN') return requestDowngrade(targetId, role);
    if (role === 'SUPERADMIN') return requestAction(targetId, 'PROMOTE_ADMIN');
    try {
      await apiRequest(`/auth/user-management/users/${targetId}/role`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) });
      setMessage('User role updated.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update role.'); }
  }

  const activeUsers = users.filter((user) => user.isActive).length;

  return (
    <AppShell>
    <main className="login-shell min-h-screen p-4 text-slate-100 sm:p-6 lg:p-10">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-8 flex flex-col gap-6 border-b border-cyan-300/20 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300"><span className="h-2 w-2 bg-cyan-300 shadow-[0_0_14px_#67e8f9]" /> Control / Identity</div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-5xl">Managements</h1>
          </div>
          <div className="grid grid-cols-3 border border-slate-700/80 bg-slate-950/45">
            <div className="border-r border-slate-700/80 px-4 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Accounts</div><div className="mt-1 text-xl font-semibold text-white">{users.length}</div></div>
            <div className="border-r border-slate-700/80 px-4 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Online</div><div className="mt-1 text-xl font-semibold text-emerald-300">{activeUsers}</div></div>
            <div className="px-4 py-3"><div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Queue</div><div className="mt-1 text-xl font-semibold text-violet-300">{registrations.length}</div></div>
          </div>
        </header>

        {currentRole === 'SUPERADMIN' ? <button type="button" onClick={() => void loadApprovals()} disabled={loadingApprovals} className="mb-6 border border-amber-300/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200 transition hover:border-amber-200/60 disabled:cursor-not-allowed disabled:opacity-50">{loadingApprovals ? 'Checking approvals...' : 'Check downgrade approvals'}</button> : null}

        {message ? <div className="mb-6 border-l-2 border-cyan-300 bg-cyan-300/[0.07] px-4 py-3 text-sm text-cyan-100 shadow-[0_0_25px_rgba(103,232,249,0.07)]">{message}</div> : null}
        {loading ? <div className="border border-slate-800 bg-slate-950/40 p-8 text-sm uppercase tracking-[0.18em] text-slate-500">Syncing identity registry...</div> : <div className="space-y-6">
          {approvals.length ? <section className="cyber-panel border-amber-300/30 p-5 md:p-6">
            <div className="flex flex-col gap-3 border-b border-amber-200/15 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] uppercase tracking-[0.22em] text-amber-300">Action required</p><h2 className="mt-2 text-xl font-semibold text-white">Superadmin approvals</h2><p className="mt-1 text-sm text-slate-400">Downgrade requests waiting for every other active superadmin.</p></div><span className="border border-amber-300/30 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">{approvals.length} pending</span></div>
            <div className="mt-5 grid gap-3 lg:grid-cols-2">{approvals.map((approval) => <div key={approval.id} className="flex flex-col justify-between gap-5 border border-amber-200/15 bg-slate-950/45 p-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center border border-amber-300/30 text-xs font-bold text-amber-200">{initials(approval.target.firstName, approval.target.lastName, approval.target.email)}</div><div><div className="font-medium text-white">{approval.target.firstName} {approval.target.lastName}</div><div className="mt-1 text-xs text-slate-400">{approval.target.email}</div><div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-amber-200/70">{approval.requestedRole} / by {approval.requestedBy}</div></div></div><button type="button" onClick={() => { setAction({ requestId: approval.requestId, action: 'DOWNGRADE_SUPERADMIN' }); setCode(''); setResendAvailableAt(Date.now() + 2 * 60 * 1000); }} className="cyber-button px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em]">Authorize</button></div>)}</div>
          </section> : null}

          <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
            <section className="cyber-panel p-5 md:p-6">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-[0.22em] text-violet-300">Intake queue</p><h2 className="mt-2 text-xl font-semibold text-white">Registration requests</h2></div><span className="border border-violet-300/25 px-2 py-1 text-xs text-violet-200">{registrations.length}</span></div>
              <div className="mt-6 space-y-3">{registrations.length === 0 ? <div className="border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No pending requests.</div> : registrations.map((request) => <div key={request.id} className="border border-slate-800 bg-slate-950/45 p-4 transition hover:border-violet-300/35"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center border border-violet-300/30 text-xs font-bold text-violet-200">{initials(request.firstName, request.lastName, request.email)}</div><div className="min-w-0"><div className="truncate font-medium text-white">{request.firstName} {request.lastName}</div><div className="truncate text-xs text-slate-500">{request.email}</div><div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-violet-300">Requested / {request.role}</div></div></div><div className="mt-4 flex gap-2"><button type="button" onClick={() => approve(request.id)} className="flex-1 bg-emerald-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-emerald-200">Approve</button><button type="button" onClick={() => reject(request.id)} className="flex-1 border border-rose-400/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-200 transition hover:border-rose-300">Reject</button></div></div>)}</div>
              <div className="mt-5"><Pager page={registrationsPage} totalPages={registrationsTotalPages} onPrevious={() => setRegistrationsPage((current) => Math.max(1, current - 1))} onNext={() => setRegistrationsPage((current) => Math.min(registrationsTotalPages, current + 1))} /></div>
            </section>

            <section className="cyber-panel min-w-0 p-5 md:p-6">
              <div className="flex flex-col gap-2 border-b border-cyan-300/15 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Identity registry</p><h2 className="mt-2 text-xl font-semibold text-white">Existing users</h2></div><span className="text-xs uppercase tracking-[0.14em] text-slate-500">{users.length} loaded / page {usersPage}</span></div>
              <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-[10px] uppercase tracking-[0.18em] text-slate-500"><tr><th className="pb-3 font-medium">Identity</th><th className="pb-3 font-medium">Access tier</th><th className="pb-3 font-medium">State</th><th className="pb-3 text-right font-medium">Control</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="border-t border-slate-800/80"><td className="py-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center border border-cyan-300/25 bg-cyan-300/[0.06] text-xs font-bold text-cyan-200">{initials(user.firstName, user.lastName, user.email)}</div><div><div className="font-medium text-white">{user.firstName} {user.lastName}</div><div className="mt-1 text-xs text-slate-500">{user.email}</div></div></div></td><td className="py-4"><select value={user.role} onChange={(event) => changeRole(user.id, event.target.value)} className="border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-300/60">{roles.map((role) => <option key={role} value={role}>{role}</option>)}</select></td><td className="py-4"><span className={`inline-flex items-center gap-2 text-xs ${user.isActive ? 'text-emerald-300' : 'text-rose-300'}`}><span className={`h-1.5 w-1.5 ${user.isActive ? 'bg-emerald-300 shadow-[0_0_8px_#6ee7b7]' : 'bg-rose-300'}`} />{user.isActive ? 'Active' : 'Inactive'}</span></td><td className="py-4 text-right">{user.isActive ? <button type="button" onClick={() => requestAction(user.id, 'DEACTIVATE')} className="border border-rose-400/35 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-rose-200 transition hover:border-rose-300">Deactivate</button> : <span className="text-xs uppercase tracking-[0.1em] text-slate-600">Deactivated</span>}</td></tr>)}</tbody></table></div>
              <div className="mt-3"><Pager page={usersPage} totalPages={usersTotalPages} onPrevious={() => setUsersPage((current) => Math.max(1, current - 1))} onNext={() => setUsersPage((current) => Math.min(usersTotalPages, current + 1))} /></div>
            </section>
          </div>
        </div>}
      </div>

      {action ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-5 backdrop-blur-sm"><div className="w-full max-w-md border border-cyan-300/35 bg-[#08121f] p-6 shadow-[0_0_55px_rgba(103,232,249,0.15)]"><div className="flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Security checkpoint</p><h2 className="mt-2 text-xl font-semibold text-white">Authorize action</h2></div><span className="text-xl text-cyan-300">⌁</span></div><p className="mt-4 text-sm leading-6 text-slate-400">Enter the six-digit code sent to your administrator email.</p><input autoFocus value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} className="field-input mt-5 text-center text-2xl tracking-[0.6em]" placeholder="000000" /><div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{resendSeconds > 0 ? `Resend available in ${Math.floor(resendSeconds / 60)}:${String(resendSeconds % 60).padStart(2, '0')}` : 'Code not received?'}</span><button type="button" onClick={resendAction} disabled={resendSeconds > 0} className="text-cyan-200 transition hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40">Resend code</button></div><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => { setAction(null); setResendAvailableAt(null); }} className="border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500">Cancel</button><button type="button" onClick={confirmAction} disabled={code.length !== 6} className="cyber-button px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Confirm</button></div></div></div> : null}
    </main>
    </AppShell>
  );
}
