export type UserRole = 'SUPERADMIN' | 'OVERSEER' | 'VERIFICATOR' | 'PIC';
export type RegistrationRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface AuthenticatedUser {
    id: string;
    email: string;
    role: UserRole;
    isActive: boolean;
    mustChangePassword?: boolean;
    firstName?: string;
    lastName?: string;
    isMfaEnabled?: boolean;
    mfaSecret?: string;
}
export interface UserRecord extends AuthenticatedUser {
    passwordHash: string;
    mustChangePassword?: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface RegistrationRequest {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    status: RegistrationRequestStatus;
    createdAt: string;
}
export interface AuthSession {
    sessionId: string;
    userId: string;
    role: UserRole;
    expiresAt: number;
    refreshExpiresAt: number;
    accessToken: string;
    refreshToken: string;
    csrfToken?: string;
    fingerprintHash?: string;
}
export interface ResetTokenRecord {
    email: string;
    expiresAt: number;
}
