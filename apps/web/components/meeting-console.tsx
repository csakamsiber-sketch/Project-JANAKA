'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api-client';

type Result = { id: string; phase: string; capturedAt: string; passPoints: number; needToFixPoints: number; waitingPoints: number; uncheckPoints: number; totalPoints: number; progressPercent: number };
type Schedule = { id: string; startAt: string; endAt: string; status: string; purpose: string; meetingNotes?: string | null; application: { id: string; name: string }; verificator?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null }; results: Result[] };
type Option = { id: string; name?: string; email?: string; firstName?: string; lastName?: string };
type ScheduleList = { items: Schedule[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

function displayName(user: Option) { return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || user.name || user.id; }
function displayVerificatorName(user?: Schedule['verificator']) { if (!user) return 'Unassigned'; return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || user.id; }
function resultPercentage(value: number, total: number) { return `${(total > 0 ? (value / total) * 100 : 0).toFixed(2)}%`; }
function toLocalDateTime(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const pad = (n: number) => String(n).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }

export function MeetingConsole({ verificatorOnly = false }: { verificatorOnly?: boolean }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [applications, setApplications] = useState<Option[]>([]);
  const [verificators, setVerificators] = useState<Option[]>([]);
  const [form, setForm] = useState({ applicationId: '', verificatorId: '', startAt: '', endAt: '', purpose: 'Application verification meeting' });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ applicationId: '', verificatorId: '', startAt: '', endAt: '', purpose: 'Application verification meeting' });
  const [finishMeetingId, setFinishMeetingId] = useState<string | null>(null);
  const [meetingNotes, setMeetingNotes] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState(String(new Date().getMonth() + 1));
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [selectedVerificator, setSelectedVerificator] = useState('');
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [confirmTicket, setConfirmTicket] = useState<{ type: 'create' | 'edit'; payload: any } | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 1500);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  function showFeedback(type: 'success' | 'error', text: string) {
    setFeedback({ type, message: text });
  }

  function validateTimeRange(startValue: string, endValue: string) {
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (!startValue || !endValue || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      showFeedback('error', 'Start and end time are required.');
      return false;
    }
    if (end <= start) {
      showFeedback('error', 'Meeting end time must be later than start time.');
      return false;
    }
    return true;
  }

  async function load() {
    setLoading(true);
    try {
      if (!verificatorOnly) {
        const options = await apiRequest<{ applications: Option[]; verificators: Option[] }>('/meetings/schedules/options');
        setApplications(options.applications ?? []);
        setVerificators(options.verificators ?? []);
      }
      const query = new URLSearchParams({ period, page: String(page), limit: '10' });
      if (!verificatorOnly && selectedVerificator) query.set('verificatorId', selectedVerificator);
      const scheduleData = await apiRequest<ScheduleList>(`/meetings/schedules?${query.toString()}`);
      setSchedules(scheduleData.items ?? []);
      setPagination(scheduleData.pagination ?? { page, limit: 10, total: 0, totalPages: 0 });
    } catch (error) {
      showFeedback('error', error instanceof Error ? error.message : 'Unable to load meeting schedules.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [verificatorOnly, period, selectedVerificator, page]);

  function openConflictConfirm(type: 'create' | 'edit', payload: Record<string, unknown>) {
    setConfirmTicket({ type, payload });
  }

  async function scheduleMeeting(event: React.FormEvent) {
    event.preventDefault();
    if (!validateTimeRange(form.startAt, form.endAt)) return;
    try {
      const payload = { ...form, startAt: new Date(form.startAt).toISOString(), endAt: new Date(form.endAt).toISOString() };
      await apiRequest('/meetings/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showFeedback('success', 'Meeting scheduled successfully.');
      setForm({ applicationId: '', verificatorId: '', startAt: '', endAt: '', purpose: 'Application verification meeting' });
      await load();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unable to schedule meeting.';
      if (/overlap|same verificator|same time/i.test(messageText)) {
        showFeedback('error', messageText);
        return;
      }
      showFeedback('error', messageText);
    }
  }

  async function confirmScheduleConflict() {
    if (!confirmTicket) return;
    showFeedback('success', 'Meeting conflict override confirmed.');
    try {
      if (confirmTicket.type === 'create') {
        await apiRequest('/meetings/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...confirmTicket.payload, forceConflictOverride: true }),
        });
        setForm({ applicationId: '', verificatorId: '', startAt: '', endAt: '', purpose: 'Application verification meeting' });
      } else {
        await apiRequest(`/meetings/schedules/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...confirmTicket.payload, forceConflictOverride: true }),
        });
      }
      setConfirmTicket(null);
      await load();
    } catch (error) {
      showFeedback('error', error instanceof Error ? error.message : 'Unable to confirm meeting change.');
    }
  }

  async function saveEditedMeeting(event: React.FormEvent) {
    event.preventDefault();
    if (!editId) return;
    if (!validateTimeRange(editForm.startAt, editForm.endAt)) return;
    try {
      const payload = { ...editForm, startAt: new Date(editForm.startAt).toISOString(), endAt: new Date(editForm.endAt).toISOString() };
      await apiRequest(`/meetings/schedules/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showFeedback('success', 'Meeting updated successfully.');
      setEditId(null);
      setEditForm({ applicationId: '', verificatorId: '', startAt: '', endAt: '', purpose: 'Application verification meeting' });
      await load();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unable to update meeting.';
      if (/overlap|same verificator|same time/i.test(messageText)) {
        showFeedback('error', messageText);
        return;
      }
      showFeedback('error', messageText);
    }
  }

  async function deleteMeeting(id: string) {
    try {
      await apiRequest(`/meetings/schedules/${id}`, { method: 'DELETE' });
      showFeedback('success', 'Meeting deleted successfully.');
      await load();
    } catch (error) { showFeedback('error', error instanceof Error ? error.message : 'Unable to delete meeting.'); }
  }

  async function updateMeeting(id: string, action: 'start' | 'finish', notes?: string) {
    try {
      await apiRequest(`/meetings/schedules/${id}/${action}`, {
        method: 'POST',
        ...(action === 'finish' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: notes ?? '' }) } : {}),
      });
      showFeedback('success', action === 'start' ? 'Meeting started and baseline captured.' : 'Meeting finished and result captured.');
      setFinishMeetingId(null);
      setMeetingNotes('');
      await load();
    } catch (error) { showFeedback('error', error instanceof Error ? error.message : 'Unable to update meeting.'); }
  }

  async function generateReport() {
    try {
      const report = await apiRequest<{ fileName: string; contentBase64: string; mimeType: string }>(`/meetings/reports?month=${reportMonth}&year=${reportYear}`);
      const binary = atob(report.contentBase64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: report.mimeType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = report.fileName;
      link.click();
      URL.revokeObjectURL(url);
      setReportOpen(false);
      showFeedback('success', 'Report downloaded.');
    } catch (error) { showFeedback('error', error instanceof Error ? error.message : 'Unable to generate report.'); }
  }

  return (
    <main className="cyber-page cyber-meetings min-h-screen bg-[#050812] p-6 text-slate-100 md:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 border-b border-cyan-400/20 pb-5">
          <p className="text-[10px] uppercase tracking-[0.34em] text-cyan-300">Verification operations</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{verificatorOnly ? 'My schedule' : 'Meeting control'}</h1>
          <div className="mt-3" />
        </header>

        {!verificatorOnly ? (
          <form onSubmit={scheduleMeeting} className="mb-8 grid gap-3 rounded-2xl border border-cyan-400/20 bg-slate-900/70 p-5 shadow-[0_0_30px_rgba(34,211,238,0.08)] md:grid-cols-2 lg:grid-cols-5">
            <select required value={form.applicationId} onChange={(event) => setForm({ ...form, applicationId: event.target.value })} className="field-input"><option value="">Application</option>{applications.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select required value={form.verificatorId} onChange={(event) => setForm({ ...form, verificatorId: event.target.value })} className="field-input"><option value="">Verificator</option>{verificators.map((item) => <option key={item.id} value={item.id}>{displayName(item)}</option>)}</select>
            <input required lang="en-GB" type="datetime-local" step="60" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} className="field-input" />
            <input required lang="en-GB" type="datetime-local" step="60" min={form.startAt || undefined} value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} className="field-input" />
            <button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">Schedule meeting</button>
          </form>
        ) : null}

        <div className="mb-6 flex flex-col gap-3 border border-slate-800 bg-slate-900/60 p-4 shadow-[0_0_20px_rgba(15,23,42,0.6)] md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2" aria-label="Schedule period">
            {(['all', 'today', 'week', 'month'] as const).map((value) => (
              <button key={value} type="button" onClick={() => { setPeriod(value); setPage(1); }} className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${period === value ? 'border-cyan-300 bg-cyan-300/15 text-cyan-100' : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-cyan-300/60'}`}>
                {value === 'all' ? 'All meetings' : value === 'today' ? 'Today' : value === 'week' ? 'This week' : 'This month'}
              </button>
            ))}
          </div>
          {!verificatorOnly ? <select value={selectedVerificator} onChange={(event) => { setSelectedVerificator(event.target.value); setPage(1); }} className="field-input md:max-w-xs"><option value="">All verificators</option>{verificators.map((item) => <option key={item.id} value={item.id}>{displayName(item)}</option>)}</select> : null}
        </div>

        <section className="grid gap-4">
          {loading ? (
            <p className="text-sm text-slate-400">Loading schedules...</p>
          ) : schedules.length === 0 ? (
            <p className="text-sm text-slate-500">No meetings scheduled.</p>
          ) : schedules.map((meeting) => (
            <article key={meeting.id} onClick={() => {
              if (!verificatorOnly && !['FINISHED', 'CANCELLED'].includes(meeting.status)) {
                setEditId(meeting.id);
                setEditForm({ applicationId: meeting.application.id, verificatorId: meeting.verificator?.id ?? '', startAt: toLocalDateTime(meeting.startAt), endAt: toLocalDateTime(meeting.endAt), purpose: meeting.purpose });
              }
            }} className={`group overflow-hidden rounded-2xl border border-slate-800 bg-[#0a1020]/90 shadow-[0_0_35px_rgba(15,23,42,0.75)] transition hover:border-cyan-400/40 hover:shadow-[0_0_30px_rgba(34,211,238,0.12)] ${!verificatorOnly && !['FINISHED', 'CANCELLED'].includes(meeting.status) ? 'cursor-pointer' : ''}`}>
              <div className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-cyan-500/10 via-slate-900 to-slate-950 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">{meeting.status}</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{meeting.application.name}</span>
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{new Date(meeting.startAt).toLocaleDateString()}</div>
              </div>

              <div className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-start">
                <div className="space-y-3">
                  <div>
                    <h2 className="text-xl font-semibold text-white">{meeting.application.name}</h2>
                    <p className="mt-1 text-sm text-slate-400">Verificator: <span className="font-medium text-cyan-200">{displayVerificatorName(meeting.verificator)}</span></p>
                  </div>
                  <div className="grid gap-2 text-sm text-slate-300 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"><span className="block text-[10px] uppercase tracking-[0.18em] text-slate-500">Start</span><span className="mt-1 block text-slate-200">{new Date(meeting.startAt).toLocaleString()}</span></div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"><span className="block text-[10px] uppercase tracking-[0.18em] text-slate-500">End</span><span className="mt-1 block text-slate-200">{new Date(meeting.endAt).toLocaleTimeString()}</span></div>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{meeting.purpose}</p>
                  {meeting.meetingNotes ? <p className="border-l border-amber-300/40 pl-3 text-sm text-amber-100/80">Notes: {meeting.meetingNotes}</p> : null}
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  {verificatorOnly && meeting.status === 'SCHEDULED' ? <button type="button" onClick={(event) => { event.stopPropagation(); void updateMeeting(meeting.id, 'start'); }} className="rounded-lg border border-emerald-300/40 bg-emerald-300/5 px-3 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-300/10">Start meeting</button> : null}
                  {verificatorOnly && meeting.status === 'IN_PROGRESS' ? <button type="button" onClick={(event) => { event.stopPropagation(); setFinishMeetingId(meeting.id); setMeetingNotes(''); }} className="rounded-lg border border-amber-300/40 bg-amber-300/5 px-3 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-300/10">Finish meeting</button> : null}
                </div>
              </div>

              {meeting.results?.length ? (
                <div className="grid gap-2 border-t border-slate-800 bg-slate-950/40 p-5 sm:grid-cols-2">
                  {meeting.results.map((result) => (
                    <div key={result.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
                      <div className="flex items-center justify-between uppercase tracking-[0.16em] text-slate-500">
                        <span>{result.phase}</span>
                        <span className="text-cyan-200">{result.progressPercent.toFixed(2)}%</span>
                      </div>
                      <div className="mt-2 text-slate-400">Pass {resultPercentage(result.passPoints, result.totalPoints)} · Need to Fix {resultPercentage(result.needToFixPoints, result.totalPoints)} · Waiting {resultPercentage(result.waitingPoints, result.totalPoints)} · Uncheck {resultPercentage(result.uncheckPoints, result.totalPoints)}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>
        {pagination.totalPages > 1 ? <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4 text-xs uppercase tracking-[0.14em] text-slate-500">
          <span>Page {pagination.page} / {pagination.totalPages} · {pagination.total} meetings</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="border border-slate-700 px-3 py-2 text-slate-300 disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
            <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} className="border border-slate-700 px-3 py-2 text-slate-300 disabled:cursor-not-allowed disabled:opacity-40">Next</button>
          </div>
        </div> : null}
      </div>

      {feedback ? <div className="fixed inset-x-0 top-6 z-[100] flex justify-center px-4"><div role="alertdialog" aria-live="assertive" className={`flex w-full max-w-3xl items-start justify-between gap-4 border px-4 py-3 text-sm shadow-2xl backdrop-blur-md ${feedback.type === 'error' ? 'border-rose-300/50 bg-[#240d16]/95 text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.28)]' : 'border-emerald-300/50 bg-[#06251c]/95 text-emerald-100 shadow-[0_0_30px_rgba(52,211,153,0.24)]'}`}><div><p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${feedback.type === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>{feedback.type === 'error' ? 'MEETING_ERROR' : 'MEETING_SUCCESS'}</p><p className="mt-1">{feedback.message}</p></div><button type="button" aria-label="Dismiss notification" onClick={() => setFeedback(null)} className={`text-lg leading-none ${feedback.type === 'error' ? 'text-rose-200 hover:text-white' : 'text-emerald-200 hover:text-white'}`}>×</button></div></div> : null}

      {editId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-5 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-cyan-400/30 bg-[#0a1020] p-6 shadow-[0_0_40px_rgba(34,211,238,0.15)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Edit meeting</h2>
              <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-300">Update slot</span>
            </div>
            <form onSubmit={saveEditedMeeting} className="grid gap-3 md:grid-cols-2">
              <select required value={editForm.applicationId} onChange={(event) => setEditForm({ ...editForm, applicationId: event.target.value })} className="field-input"><option value="">Application</option>{applications.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select required value={editForm.verificatorId} onChange={(event) => setEditForm({ ...editForm, verificatorId: event.target.value })} className="field-input"><option value="">Verificator</option>{verificators.map((item) => <option key={item.id} value={item.id}>{displayName(item)}</option>)}</select>
              <input required lang="en-GB" type="datetime-local" step="60" value={editForm.startAt} onChange={(event) => setEditForm({ ...editForm, startAt: event.target.value })} className="field-input" />
              <input required lang="en-GB" type="datetime-local" step="60" min={editForm.startAt || undefined} value={editForm.endAt} onChange={(event) => setEditForm({ ...editForm, endAt: event.target.value })} className="field-input" />
              <textarea required rows={3} value={editForm.purpose} onChange={(event) => setEditForm({ ...editForm, purpose: event.target.value })} className="field-input md:col-span-2" />
              <div className="md:col-span-2 flex items-center justify-between gap-2 pt-2">
                <button type="button" onClick={() => { if (editId) { void deleteMeeting(editId); setEditId(null); } }} className="rounded-xl border border-rose-300/40 bg-rose-300/5 px-3 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-300/10">🗑 Delete</button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditId(null)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500">Cancel</button>
                  <button type="submit" className="rounded-xl bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">Save changes</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {confirmTicket ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-300/30 bg-[#0a1020] p-5 shadow-[0_0_35px_rgba(251,191,36,0.12)]">
            <h2 className="text-xl font-semibold text-white">Confirm schedule conflict</h2>
            <p className="mt-2 text-sm text-slate-300">This verificator already has a meeting in the same time window. Confirm you want to proceed anyway.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmTicket(null)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">Cancel</button>
              <button type="button" onClick={confirmScheduleConflict} className="rounded-xl bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950">Confirm</button>
            </div>
          </div>
        </div>
      ) : null}

      {finishMeetingId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-5 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-amber-300/30 bg-[#0a1020] p-5 shadow-[0_0_35px_rgba(251,191,36,0.12)]">
            <h2 className="text-xl font-semibold text-white">Finish meeting</h2>
            <p className="mt-1 text-sm text-slate-400">Add an optional note for this meeting.</p>
            <textarea value={meetingNotes} onChange={(event) => setMeetingNotes(event.target.value)} rows={5} maxLength={4000} className="field-input mt-4 w-full resize-none" placeholder="Meeting notes (optional)" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setFinishMeetingId(null)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">Cancel</button>
              <button type="button" onClick={() => updateMeeting(finishMeetingId, 'finish', meetingNotes)} className="cyber-button px-3 py-2 text-sm text-amber-50">Finish and record</button>
            </div>
          </div>
        </div>
      ) : null}

      {reportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-5 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-cyan-400/30 bg-[#0a1020] p-5 shadow-[0_0_35px_rgba(34,211,238,0.12)]">
            <h2 className="text-xl font-semibold text-white">Generate monthly report</h2>
            <p className="mt-1 text-sm text-slate-400">Choose the meeting month and year.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <select value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} className="field-input">{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2024, index, 1).toLocaleString('en-US', { month: 'long' })}</option>)}</select>
              <input type="number" min="2000" max="2100" value={reportYear} onChange={(event) => setReportYear(event.target.value)} className="field-input" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setReportOpen(false)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">Cancel</button>
              <button type="button" onClick={generateReport} className="rounded-xl bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950">Download Excel</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
