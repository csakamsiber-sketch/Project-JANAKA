"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('@nestjs/common', () => ({
    Injectable: () => (target) => target,
}));
const node_crypto_1 = require("node:crypto");
const jsonwebtoken_1 = require("jsonwebtoken");
const auth_constants_1 = require("../auth/auth.constants");
const csrf_guard_1 = require("./csrf.guard");
describe('CSRFGuard', () => {
    it('consumes the session token once and rotates it in the response', async () => {
        const initialToken = 'initial-token';
        const accessToken = (0, jsonwebtoken_1.sign)({ sub: 'user-1', email: 'admin@janus.local', role: 'SUPERADMIN' }, auth_constants_1.JWT_SECRET, {
            issuer: 'jamus-kalimasada',
            audience: 'janus-web',
            expiresIn: '15m',
        });
        const session = {
            id: 'session-1',
            tokenHash: 'unused-in-test',
            csrfTokenHash: (0, node_crypto_1.createHash)('sha256').update(initialToken).digest('hex'),
            revoked: false,
            expiresAt: new Date(Date.now() + 60_000),
        };
        const authService = {
            consumeCsrfToken: jest.fn().mockImplementation(async (_accessToken, cookieToken, headerToken, replacementToken) => {
                if (cookieToken !== headerToken || (0, node_crypto_1.createHash)('sha256').update(headerToken).digest('hex') !== session.csrfTokenHash)
                    return false;
                session.csrfTokenHash = (0, node_crypto_1.createHash)('sha256').update(replacementToken).digest('hex');
                return true;
            }),
        };
        const guard = new csrf_guard_1.CSRFGuard(authService);
        const firstResponse = createResponse();
        const firstNext = jest.fn();
        await guard.use(createRequest(accessToken, initialToken), firstResponse, firstNext);
        expect(firstNext).toHaveBeenCalledTimes(1);
        expect(firstResponse.setCookie).toHaveBeenCalledTimes(1);
        const rotatedToken = firstResponse.setCookie.mock.calls[0][1];
        const secondResponse = createResponse();
        const secondNext = jest.fn();
        await guard.use(createRequest(accessToken, initialToken), secondResponse, secondNext);
        expect(secondNext).not.toHaveBeenCalled();
        expect(secondResponse.statusCode).toBe(403);
        expect(authService.consumeCsrfToken).toHaveBeenCalledTimes(2);
        expect(rotatedToken).not.toBe(initialToken);
    });
});
function createRequest(accessToken, csrfToken) {
    return {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', authorization: `Bearer ${accessToken}`, 'x-csrf-token': csrfToken },
        cookies: { janus_session: accessToken, janus_csrf: csrfToken },
        url: '/api/v1/applications',
    };
}
function createResponse() {
    return {
        setCookie: jest.fn(),
        setHeader: jest.fn(),
        end: jest.fn(),
        statusCode: 200,
    };
}
//# sourceMappingURL=csrf.guard.spec.js.map