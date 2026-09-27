"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
jest.mock('@nestjs/common', () => ({
    Injectable: () => (target) => target,
    NestInterceptor: class NestInterceptor {
    },
}));
const rxjs_1 = require("rxjs");
const security_logging_interceptor_1 = require("./security-logging.interceptor");
describe('SecurityLoggingInterceptor', () => {
    it('logs successful requests with the actual HTTP status code', (done) => {
        const log = jest.fn();
        const response = { statusCode: 200 };
        const request = {
            method: 'GET',
            originalUrl: '/api/v1/meetings/schedules?period=all&page=1&limit=10',
            headers: { 'user-agent': 'jest-agent', origin: 'http://localhost:3110' },
            ip: '127.0.0.1',
        };
        const context = {
            switchToHttp: () => ({
                getRequest: () => request,
                getResponse: () => response,
            }),
        };
        const next = { handle: () => (0, rxjs_1.of)({ ok: true }) };
        const interceptor = new security_logging_interceptor_1.SecurityLoggingInterceptor({ log });
        interceptor.intercept(context, next).subscribe({
            next: () => {
                expect(log).toHaveBeenCalledWith(expect.objectContaining({
                    event: 'security_event',
                    statusCode: 200,
                    errorCode: 'REQUEST_OK',
                    errorType: 'info',
                    message: 'Request completed',
                }));
                done();
            },
            error: done,
        });
    });
});
//# sourceMappingURL=security-logging.interceptor.spec.js.map