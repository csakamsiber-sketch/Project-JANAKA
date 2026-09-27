import { UserRole } from './auth.types';

export const ROLE_PERMISSIONS: Record<UserRole, readonly string[]> = {
  SUPERADMIN: [
    'users.manage',
    'roles.manage',
    'system.configure',
    'standards.manage',
    'integrations.manage',
    'applications.view',
    'meetings.view',
    'findings.view',
    'audit.view',
    'monitoring.configure',
  ],
  OVERSEER: [
    'applications.manage',
    'verificators.assign',
    'meetings.approve',
    'meetings.invite',
    'verification.period.manage',
    'progress.monitor',
    'findings.review',
    'mom.approve',
    'dashboards.view',
  ],
  VERIFICATOR: [
    'applications.access',
    'verification.perform',
    'meetings.participate',
    'progress.record',
    'findings.record',
    'meetings.complete',
    'verification.data.access',
  ],
  PIC: [
    'applications.view.owned',
    'meetings.request',
    'application.info.provide',
    'developer.info.provide',
    'spreadsheet.info.provide',
    'meetings.participate',
    'findings.view.relevant',
    'remediation.provide',
  ],
};

export function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
