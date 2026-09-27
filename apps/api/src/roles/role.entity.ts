export type RoleName = 'SUPERADMIN' | 'OVERSEER' | 'VERIFICATOR' | 'PIC';

export interface RoleEntity {
  id: string;
  name: RoleName;
  description: string;
  grantedPermissions: string[];
  createdAt: Date;
  updatedAt: Date;
}
