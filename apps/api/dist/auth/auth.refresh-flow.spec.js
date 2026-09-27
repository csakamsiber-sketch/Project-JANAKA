"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('@nestjs/common', () => ({
    Injectable: () => (target) => target,
}));
const auth_service_1 = require("./auth.service");
describe('AuthService refresh flow', () => {
    let service;
    beforeEach(() => {
        service = new auth_service_1.AuthService();
    });
    it('rotates a valid refresh token when the fingerprint matches', async () => {
        const user = service.createUser({
            id: 'u-refresh-1',
            email: 'refresh-ok@example.com',
            password: 'Password123!',
            firstName: 'Refresh',
            lastName: 'User',
            role: 'PIC',
        });
        const session = service.createSession(user, 'device-123');
        const previousAccessToken = session.accessToken;
        const previousRefreshToken = session.refreshToken;
        const refreshed = await service.refreshPersistent(session.refreshToken, 'csrf-rotated', 'device-123');
        expect(refreshed).toBeDefined();
        expect(refreshed?.accessToken).not.toBe(previousAccessToken);
        expect(refreshed?.refreshToken).not.toBe(previousRefreshToken);
        expect(refreshed?.userId).toBe(user.id);
    });
    it('rejects a refresh token when the fingerprint mismatches', async () => {
        const user = service.createUser({
            id: 'u-refresh-2',
            email: 'refresh-fingerprint@example.com',
            password: 'Password123!',
            firstName: 'Device',
            lastName: 'Mismatch',
            role: 'VERIFICATOR',
        });
        const session = service.createSession(user, 'device-456');
        const refreshed = await service.refreshPersistent(session.refreshToken, 'csrf-rotated', 'different-device');
        expect(refreshed).toBeUndefined();
    });
    it('rejects an expired refresh token before rotating the session', async () => {
        const user = service.createUser({
            id: 'u-refresh-3',
            email: 'refresh-expired@example.com',
            password: 'Password123!',
            firstName: 'Expired',
            lastName: 'Refresh',
            role: 'OVERSEER',
        });
        const session = service.createSession(user, 'device-789');
        session.refreshExpiresAt = Date.now() - 60_000;
        const refreshed = await service.refreshPersistent(session.refreshToken, 'csrf-rotated', 'device-789');
        expect(refreshed).toBeUndefined();
    });
    it('accepts a refresh request when no fingerprint is bound yet', async () => {
        const user = service.createUser({
            id: 'u-refresh-4',
            email: 'refresh-unbound@example.com',
            password: 'Password123!',
            firstName: 'Unbound',
            lastName: 'Fingerprint',
            role: 'PIC',
        });
        const session = service.createSession(user);
        const refreshed = await service.refreshPersistent(session.refreshToken, 'csrf-rotated', undefined);
        expect(refreshed).toBeDefined();
        expect(refreshed?.userId).toBe(user.id);
    });
    it('rejects a missing refresh token outright', async () => {
        const refreshed = await service.refreshPersistent('', 'csrf-rotated', 'device-abc');
        expect(refreshed).toBeUndefined();
    });
    it('returns no session for an invalid refresh token', async () => {
        const refreshed = await service.refreshPersistent('not-a-valid-refresh-token', 'csrf-rotated', 'device-abc');
        expect(refreshed).toBeUndefined();
    });
    it('keeps access tokens locked after refresh rotation', async () => {
        const user = service.createUser({
            id: 'u-refresh-5',
            email: 'refresh-rotation@example.com',
            password: 'Password123!',
            firstName: 'Rotation',
            lastName: 'User',
            role: 'SUPERADMIN',
        });
        const session = service.createSession(user, 'device-rotation');
        const previousAccessToken = session.accessToken;
        const previousRefreshToken = session.refreshToken;
        const refreshed = await service.refreshPersistent(session.refreshToken, 'csrf-rotated', 'device-rotation');
        expect(refreshed).toBeDefined();
        expect(refreshed?.accessToken).not.toBe(previousAccessToken);
        expect(refreshed?.refreshToken).not.toBe(previousRefreshToken);
        expect(service.getSessionByAccessToken(previousAccessToken)).toBeUndefined();
        expect(service.getSessionByAccessToken(refreshed.accessToken)).toBeDefined();
    });
});
//# sourceMappingURL=auth.refresh-flow.spec.js.map