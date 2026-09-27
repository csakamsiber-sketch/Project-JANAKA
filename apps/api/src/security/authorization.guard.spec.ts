import { requirePermission } from './authorization.guard';

describe('authorization guard', () => {
  it('allows superadmin access to admin rights', () => {
    expect(requirePermission('SUPERADMIN', 'users.manage')).toBe(true);
  });

  it('denies pic access to system admin rights', () => {
    expect(requirePermission('PIC', 'users.manage')).toBe(false);
  });

  it('allows overseer access to monitoring', () => {
    expect(requirePermission('OVERSEER', 'progress.monitor')).toBe(true);
  });
});
