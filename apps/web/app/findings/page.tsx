'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { apiRequest, notifyGlobalError } from '../../lib/api-client';

type Finding = {
  id: string;
  applicationId: string;
  verificationPeriodId: string;
  title: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INFO';
  status: 'OPEN' | 'UNDER_REVIEW' | 'MITIGATED' | 'FIXED' | 'FALSE_POSITIVE' | 'ACCEPTED_RISK';
  affectedComponent: string;
  cve?: string;
  fixedVersion?: string;
  evidence?: string;
  recommendation?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type FindingsResponse = {
  items: Finding[];
  page: number;
  total: number;
  totalPages: number;
  summary?: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
};

type AppOption = { id: string; name: string };

const PAGE_SIZE = 10;

export default function FindingsPage() {
  const [items, setItems] = useState<Finding[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [severityFilter, setSeverityFilter] = useState('');
  const [applicationFilter, setApplicationFilter] = useState('');
  const [summary, setSummary] = useState({
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  });
  const [applications, setApplications] = useState<AppOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const loadFindings = async (nextPage = page, appId = applicationFilter, severity = severityFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
      if (appId) params.set('applicationId', appId);
      if (severity) params.set('severity', severity);
      const data = await apiRequest<FindingsResponse>(`/findings?${params.toString()}`);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setPage(Number(data?.page ?? nextPage));
      setTotalPages(Number(data?.totalPages ?? 1));
      setSummary(data?.summary ?? {
        total: Number(data?.total ?? 0),
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      });
    } catch (loadError) {
      notifyGlobalError(loadError instanceof Error ? loadError.message : 'Unable to load findings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadApplications = async () => {
      try {
        const data = await apiRequest<AppOption[]>('/applications/options');
        setApplications(Array.isArray(data) ? data : []);
      } catch {
        setApplications([]);
      }
    };
    void loadApplications();
  }, []);

  useEffect(() => {
    void loadFindings(page, applicationFilter, severityFilter);
  }, [page, applicationFilter, severityFilter]);

  const openNistEntry = (item: Finding) => {
    if (!item.cve) return;
    const url = `https://nvd.nist.gov/vuln/detail/${item.cve.toUpperCase()}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <AppShell>
      <main className="findings-shell min-h-screen p-6 text-slate-100 md:p-8 xl:p-10">
        <div className="mx-auto max-w-7xl">
          <header className="mb-6 flex flex-col gap-4 border-b border-cyan-500/20 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.38em] text-cyan-300">Threat signal board</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-4xl">Findings</h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="cyber-field min-w-[14rem]">
                <select value={applicationFilter} onChange={(event) => { setApplicationFilter(event.target.value); setPage(1); }} className="field-input" aria-label="Filter by application">
                  <option value="">All applications</option>
                  {applications.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
                </select>
              </div>

              <div className="cyber-field min-w-[10rem]">
                <select value={severityFilter} onChange={(event) => { setSeverityFilter(event.target.value); setPage(1); }} className="field-input" aria-label="Filter by severity">
                  <option value="">All severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                  <option value="INFO">Info</option>
                </select>
              </div>
            </div>
          </header>

          <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="cyber-stat cyber-stat-total">
              <span>Total</span>
              <strong>{summary.total}</strong>
            </div>
            <div className="cyber-stat cyber-stat-critical">
              <span>Critical</span>
              <strong>{summary.critical}</strong>
            </div>
            <div className="cyber-stat cyber-stat-high">
              <span>High</span>
              <strong>{summary.high}</strong>
            </div>
            <div className="cyber-stat cyber-stat-medium">
              <span>Medium</span>
              <strong>{summary.medium}</strong>
            </div>
            <div className="cyber-stat cyber-stat-low">
              <span>Low</span>
              <strong>{summary.low}</strong>
            </div>
          </section>

          <section className="space-y-4">
            {loading ? (
              <div className="cyber-empty">Loading findings…</div>
            ) : items.length === 0 ? (
              <div className="cyber-empty">No findings found for the current filters.</div>
            ) : (
              items.map((item) => (
                <article
                  key={item.id}
                  className={`cyber-card ${item.cve ? 'cursor-pointer transition hover:border-cyan-400/60 hover:shadow-[0_0_24px_rgba(103,232,249,0.12)]' : ''}`}
                  onClick={() => openNistEntry(item)}
                  onKeyDown={(event) => {
                    if (item.cve && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      openNistEntry(item);
                    }
                  }}
                  role={item.cve ? 'link' : undefined}
                  tabIndex={item.cve ? 0 : undefined}
                  aria-label={item.cve ? `Open NIST detail for ${item.cve}` : undefined}
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className={`cyber-chip ${item.severity.toLowerCase()}`}>{item.severity}</span>
                        {item.cve ? <span className="cyber-chip cyan">{item.cve.toUpperCase()}</span> : null}
                        {item.fixedVersion ? <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-200">Fix in V.{item.fixedVersion}</span> : null}
                      </div>

                      <div className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">{item.title}</h2>
                        <p className="max-w-3xl text-sm leading-6 text-slate-300">{item.description}</p>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs uppercase tracking-[0.12em] text-slate-400">
                        <span>Component: {item.affectedComponent}</span>
                        <span>Status: {item.status}</span>
                        <span>Created: {new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>

          {totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 shadow-[0_0_24px_rgba(103,232,249,0.06)]">
              <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Page {page} / {totalPages}</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="relative overflow-hidden rounded-xl border border-cyan-400/60 bg-slate-950/80 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.28em] text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.22)] transition hover:border-cyan-300 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500 disabled:shadow-none">
                  Prev
                </button>
                <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading} className="relative overflow-hidden rounded-xl border border-fuchsia-400/60 bg-slate-950/80 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.28em] text-fuchsia-100 shadow-[0_0_18px_rgba(217,70,239,0.22)] transition hover:border-fuchsia-300 hover:bg-fuchsia-500/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500 disabled:shadow-none">
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
