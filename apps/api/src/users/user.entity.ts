export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface UserEntity {
  id: string;
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  role: 'SUPERADMIN' | 'OVERSEER' | 'VERIFICATOR' | 'PIC';
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}
