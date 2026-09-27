'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api-client';

const items = [
  { label: 'Overview', href: '/dashboard', icon: '◆' },
  { label: 'Applications', href: '/applications', icon: '▣' },
  { label: 'Meetings', href: '/meetings', icon: '◫', managementOnly: true },
  { label: 'My Schedule', href: '/my-schedule', icon: '◔', verificatorOnly: true },
  { label: 'Findings', href: '/findings', icon: '◈' },
  { label: 'Managements', href: '/user-management', icon: '⚙', superadminOnly: true },
  { label: 'Settings', href: '/settings', icon: '☷' },
];

function getCsrfToken() {
  return document.cookie.split('; ').find((cookie) => cookie.startsWith('janus_csrf='))?.split('=').slice(1).join('=') ?? '';
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen = false, onCloseMobile }: { collapsed: boolean; onToggleCollapse: () => void; mobileOpen?: boolean; onCloseMobile?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentRole, setCurrentRole] = useState<string>();

  useEffect(() => {
    apiRequest<{ role?: string }>('/auth/me').then((user) => setCurrentRole(user?.role)).catch(() => setCurrentRole(undefined));
  }, []);

  async function handleLogout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': getCsrfToken() } }, { retryOnUnauthorized: false });
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  const visibleItems = items.filter((item) => ((!item.managementOnly && !item.verificatorOnly && !item.superadminOnly) || ((item.managementOnly && (currentRole === 'SUPERADMIN' || currentRole === 'OVERSEER')) || (item.superadminOnly && currentRole === 'SUPERADMIN') || (item.verificatorOnly && currentRole === 'VERIFICATOR'))));

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-72 shrink-0 border-r border-slate-800 bg-slate-950/90 backdrop-blur-sm transition-all duration-300 ease-in-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:flex lg:w-auto ${collapsed ? 'lg:w-20' : 'lg:w-72'}`}
      >
        <div className="flex h-full w-72 flex-col lg:w-full">
          <div className={`flex items-center gap-3 border-b border-slate-800/60 p-6 transition-all duration-300 ${collapsed ? 'justify-center px-3' : ''}`}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden border border-cyan-300/40 bg-slate-950 shadow-[0_0_18px_rgba(103,232,249,0.18)]">
              <img src="/jamus_kalimasada_logo.png" alt="JAMUS KALIMASADA" className="h-full w-full object-contain" />
            </div>
            <div className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
              <div className="text-xs uppercase tracking-[0.25em] text-slate-400">JAMUS</div>
              <div className="text-sm font-semibold text-white">KALIMASADA</div>
            </div>
          </div>

          <nav className="flex-1 space-y-2 overflow-y-auto p-4">
            {visibleItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={onCloseMobile}
                  title={collapsed ? item.label : undefined}
                  className={
                    isActive
                      ? `flex items-center gap-3 rounded-xl bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 ring-1 ring-cyan-500/30 transition-all duration-300 ${collapsed ? 'justify-center' : ''}`
                      : `flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 transition-all duration-300 hover:bg-slate-800/80 hover:text-white ${collapsed ? 'justify-center' : ''}`
                  }
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>{item.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="space-y-4 p-4">
            <button
              type="button"
              onClick={handleLogout}
              title={collapsed ? 'Logout' : undefined}
              className={`flex w-full items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-200 transition hover:bg-rose-500/20 ${collapsed ? 'justify-center' : ''}`}
            >
              <span className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>Logout</span>
              {collapsed ? <span aria-hidden="true" className="text-lg">⇠</span> : null}
            </button>

            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden w-full items-center justify-center rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-400 transition hover:border-cyan-400/40 hover:text-cyan-200 lg:flex"
            >
              {collapsed ? '»' : '« Collapse'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
