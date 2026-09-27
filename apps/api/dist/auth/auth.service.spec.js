"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('@nestjs/common', () => ({
    Injectable: () => (target) => target,
}));
const auth_service_1 = require("./auth.service");
describe('AuthService', () => {
    let service;
    beforeEach(() => {
        service = new auth_service_1.AuthService();
    });
    it('creates a secure session for an active user', () => {
        const user = {
            id: 'u-1',
            email: 'admin@example.com',
            role: 'SUPERADMIN',
            isActive: true,
        };
        const session = service.createSession(user);
        expect(session.userId).toBe('u-1');
        expect(session.role).toBe('SUPERADMIN');
        expect(session.expiresAt).toBeGreaterThan(Date.now());
    });
    it('revokes a session', () => {
        const user = {
            id: 'u-2',
            email: 'pic@example.com',
            role: 'PIC',
            isActive: true,
        };
        const session = service.createSession(user);
        service.revokeSession(session.sessionId);
        expect(service.getSession(session.sessionId)).toBeUndefined();
    });
    it('enforces role-based permission checks', () => {
        const superAdmin = {
            id: 'u-3',
            email: 'sa@example.com',
            role: 'SUPERADMIN',
            isActive: true,
        };
        const pic = {
            id: 'u-4',
            email: 'pic@example.com',
            role: 'PIC',
            isActive: true,
        };
        expect(service.authorize(superAdmin, 'users.manage')).toBe(true);
        expect(service.authorize(pic, 'users.manage')).toBe(false);
    });
    it('requires a valid email before creating a registration request', async () => {
        await expect(service.createRegistrationRequest({
            email: 'invalid-email',
            password: 'Password123!',
            firstName: 'A',
            lastName: 'B',
            role: 'PIC',
        })).rejects.toThrow(/valid email/i);
    });
    it('seeds a default admin user for console login', () => {
        const user = service.authenticateUser('admin@janus.local', 'P@ssw0rd12345');
        expect(user).toBeTruthy();
        expect(user?.role).toBe('SUPERADMIN');
        expect(user?.email).toBe('admin@janus.local');
        expect(service.getUserByEmail('admin@janus.local')?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
    it('creates a reset token and blocks a blacklisted jwt after logout', () => {
        const user = service.createUser({
            id: 'u-9',
            email: 'reset@example.com',
            password: 'Password123!',
            role: 'PIC',
            firstName: 'Reset',
            lastName: 'User',
        });
        const reset = service.requestPasswordReset(user.email);
        expect(reset.token).toBeTruthy();
        const blacklisted = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1LTkiLCJleHAiOjQ2MDAwMDAwMDB9.signature';
        service.blacklistToken(blacklisted, 60000);
        expect(service.isTokenBlacklisted(blacklisted)).toBe(true);
    });
    it('revokes all active sessions after a successful password change', async () => {
        const user = service.createUser({
            id: 'u-10',
            email: 'security@example.com',
            password: 'OldPassword123!',
            role: 'VERIFICATOR',
            firstName: 'Security',
            lastName: 'User',
        });
        const firstSession = service.createSession({
            id: user.id,
            email: user.email,
            role: user.role,
            isActive: true,
        });
        const secondSession = service.createSession({
            id: user.id,
            email: user.email,
            role: user.role,
            isActive: true,
        });
        await expect(service.changePassword(secondSession.accessToken, 'OldPassword123!', 'NewPassword456!')).resolves.toBe(true);
        expect(service.getSession(firstSession.sessionId)).toBeUndefined();
        expect(service.getSession(secondSession.sessionId)).toBeUndefined();
        expect(service.authenticateUser('security@example.com', 'NewPassword456!')).toBeTruthy();
        expect(service.authenticateUser('security@example.com', 'OldPassword123!')).toBeUndefined();
    });
    it('replaces the previous in-memory session when the user logs in again', async () => {
        const user = service.createUser({
            id: 'u-11',
            email: 'single-session@example.com',
            password: 'OldPassword123!',
            role: 'PIC',
            firstName: 'Single',
            lastName: 'Session',
        });
        const firstSession = service.createSession(user, 'device-one');
        const secondSession = service.createSession(user, 'device-two');
        expect(service.getSession(firstSession.sessionId)).toBeUndefined();
        expect(service.getSessionByRefreshToken(firstSession.refreshToken)).toBeUndefined();
        expect(service.getSession(secondSession.sessionId)).toBeDefined();
    });
});
//# sourceMappingURL=auth.service.spec.js.map