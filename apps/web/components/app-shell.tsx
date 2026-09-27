'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './sidebar';
import { apiRequest } from '../lib/api-client';

const STORAGE_KEY = 'janus_sidebar_collapsed';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalError, setGlobalError] = useState<{ message: string; code: string; success?: boolean } | null>(null);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === 'true');
    setHydrated(true);
  }, []);

  useEffect(() => {
    void apiRequest('/auth/me').catch(() => undefined);
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
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <div className={`cyber-shell flex min-h-screen bg-slate-950 ${hydrated ? '' : 'invisible'}`}>
      {globalError ? <div role="alert" className="fixed inset-x-0 top-0 z-[100] flex justify-center px-4 pt-3"><div className={`flex w-full max-w-3xl items-start justify-between gap-4 border px-4 py-3 text-sm backdrop-blur-md ${globalError.success ? 'border-emerald-300/50 bg-[#06251c]/95 text-emerald-100 shadow-[0_0_30px_rgba(52,211,153,0.24)]' : 'border-rose-300/50 bg-[#240d16]/95 text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.28)]'}`}><div><p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${globalError.success ? 'text-emerald-300' : 'text-rose-300'}`}>{globalError.code}</p><p className="mt-1">{globalError.message}</p></div><button type="button" aria-label="Dismiss notification" onClick={() => setGlobalError(null)} className={`text-lg leading-none ${globalError.success ? 'text-emerald-200 hover:text-white' : 'text-rose-200 hover:text-white'}`}>×</button></div></div> : null}
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/70 lg:hidden"
        />
      ) : null}

      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
        className={`fixed left-4 top-4 z-50 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/90 text-xl text-white shadow-lg backdrop-blur-sm transition hover:border-cyan-400/40 hover:text-cyan-200 lg:hidden ${mobileOpen ? 'hidden' : 'flex'}`}
      >
        ☰
      </button>

      <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="min-w-0 flex-1 pt-16 lg:pt-0 lg:pb-0">{children}</div>
    </div>
  );
}
