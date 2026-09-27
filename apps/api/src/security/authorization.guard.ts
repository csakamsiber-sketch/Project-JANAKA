export function requirePermission(role: string, permission: string): boolean {
  const permissions: Record<string, string[]> = {
    SUPERADMIN: ['users.manage', 'roles.manage', 'applications.manage', 'meetings.view', 'findings.view', 'audit.view'],
    OVERSEER: ['applications.manage', 'meetings.approve', 'progress.monitor', 'dashboards.view'],
    VERIFICATOR: ['applications.access', 'verification.perform', 'progress.record'],
    PIC: ['applications.view.owned', 'meetings.request', 'application.info.provide'],
  };

  return (permissions[role] ?? []).includes(permission);
}
