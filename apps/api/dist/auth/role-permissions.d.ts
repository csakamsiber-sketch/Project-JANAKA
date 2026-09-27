import { UserRole } from './auth.types';
export declare const ROLE_PERMISSIONS: Record<UserRole, readonly string[]>;
export declare function hasPermission(role: UserRole, permission: string): boolean;
