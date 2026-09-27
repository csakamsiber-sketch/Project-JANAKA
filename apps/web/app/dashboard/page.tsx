 'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { StatCard } from '../../components/stat-card';
import { apiRequest } from '../../lib/api-client';

type DashboardSummary = {
  totalApplications: number;
  cveFindings: number;
  criticalFindings: number;
  verificationSLA: number;
  meetingsThisMonth: number;
  upcomingMeetings: Array<{ id: string; application: string; startAt: string; endAt: string; verificator: string }>;
  topCveFindings: Array<{ id: string; cve: string; library: string; version: string; severity: string; summary: string }>;
  pendingVerificationApplications: Array<{ id: string; name: string; percent: number }>;
  longestVerificationElapsed: Array<{ id: string; name: string; elapsedDays: number }>;
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [applications, setApplications] = useState<any[]>([]);

  useEffect(() => {
    void Promise.all([
      apiRequest<DashboardSummary>('/dashboard/summary'),
      apiRequest<{ items?: any[] }>('/applications?page=1&limit=4'),
    ]).then(([nextSummary, nextApplications]) => {
      setSummary(nextSummary);
      setApplications(nextApplications.items ?? []);
    }).catch(() => {
      window.location.assign('/login');
    });
  }, []);

  if (!summary) {
    return <AppShell><main className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10"><p className="text-sm text-slate-400">Loading overview...</p></main></AppShell>;
  }

  const metrics = [
    { label: 'Applications', value: String(summary.totalApplications).padStart(2, '0'), accent: 'bg-emerald-500/10 text-emerald-300' },
    { label: 'CVE findings', value: String(summary.cveFindings ?? summary.criticalFindings ?? 0).padStart(2, '0'), accent: 'bg-rose-500/10 text-rose-300' },
    { label: 'Meetings', value: String(summary.meetingsThisMonth).padStart(2, '0'), accent: 'bg-violet-500/10 text-violet-300' },
    { label: 'Verification SLA', value: `${summary.verificationSLA}%`, accent: 'bg-cyan-500/10 text-cyan-300' },
  ];

  return (
    <AppShell>
      <main className="cyber-page cyber-overview min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Operations dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Executive overview</h1>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {metrics.map((metric) => (
            <StatCard key={metric.label} {...metric} />
          ))}
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Application health</h2>
              <span className="text-sm text-slate-400">Updated 12 min ago</span>
            </div>

            <div className="space-y-4">
              {applications.slice(0, 4).map((app: any) => (
                <div key={app.id ?? app.name} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div>
                    <div className="font-medium text-white">{app.name}</div>
                    <div className="text-sm text-slate-400">{app.owner}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                      {app.status ?? 'ACTIVE'}
                    </span>
                    <span className="text-sm text-slate-300">{app.environment ?? 'Production'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold text-white">Upcoming meetings</h2>
            <div className="mt-5 space-y-3">{summary.upcomingMeetings.length ? summary.upcomingMeetings.map((meeting) => <div key={meeting.id} className="border-b border-slate-800 pb-3 text-sm"><div className="font-medium text-white">{meeting.application}</div><div className="mt-1 text-slate-400">{new Date(meeting.startAt).toLocaleString()} · {meeting.verificator}</div></div>) : <p className="text-sm text-slate-500">No meetings today or tomorrow.</p>}</div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <div className="min-h-[420px] rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold text-white">Top 5 CVE findings</h2>
            <div className="mt-5 space-y-3">{summary.topCveFindings.length ? summary.topCveFindings.map((finding) => <div key={finding.id} className="border-b border-slate-800 pb-3"><div className="flex justify-between gap-3"><span className="text-sm font-medium text-white">{finding.cve}</span><span className="text-xs text-rose-300">{finding.severity}</span></div><div className="mt-1 text-xs text-slate-400">{finding.library} v{finding.version}</div><div className="mt-1 text-xs text-slate-500">{finding.summary}</div></div>) : <p className="text-sm text-slate-500">No CVE findings in the database.</p>}</div>
          </div>

          <div className="space-y-6">
            <div className="min-h-[200px] rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-lg font-semibold text-white">Pending verification</h2>
              <div className="mt-5 space-y-3">{summary.pendingVerificationApplications.map((application) => <div key={application.id} className="flex justify-between border-b border-slate-800 pb-3 text-sm"><span className="text-white">{application.name}</span><span className="text-amber-300">{application.percent.toFixed(2)}%</span></div>)}</div>
            </div>

            <div className="min-h-[200px] rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-lg font-semibold text-white">Last verification</h2>
              <div className="mt-5 space-y-3">{summary.longestVerificationElapsed.map((application) => <div key={application.id} className="flex justify-between border-b border-slate-800 pb-3 text-sm"><span className="text-white">{application.name}</span><span className="text-slate-400">{application.elapsedDays < 0 ? 'Never verified' : `${application.elapsedDays} days`}</span></div>)}</div>
            </div>
          </div>
        </section>

      </main>
    </AppShell>
  );
}
