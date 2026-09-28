"use strict";
jest.mock('@nestjs/common', () => ({
    Injectable: () => (target) => target,
    BadRequestException: class BadRequestException extends Error {
    },
}));
const { ZodValidationPipe } = require('./zod-validation.pipe');
describe('ZodValidationPipe', () => {
    it('preserves request body fields needed by controllers such as login passwords', () => {
        const pipe = new ZodValidationPipe();
        const value = {
            email: 'admin@janus.local',
            password: 'Password123!',
            fingerprint: 'abc123def456',
        };
        expect(pipe.transform(value, {})).toEqual(value);
    });
});
//# sourceMappingURL=zod-validation.pipe.spec.js.map