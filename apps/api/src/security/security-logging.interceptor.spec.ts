jest.mock('@nestjs/common', () => ({
  Injectable: () => (target: unknown) => target,
  NestInterceptor: class NestInterceptor {},
}));

import { of } from 'rxjs';
import { SecurityLoggingInterceptor } from './security-logging.interceptor';

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

    const next = { handle: () => of({ ok: true }) };
    const interceptor = new SecurityLoggingInterceptor({ log } as any);

    interceptor.intercept(context as any, next as any).subscribe({
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
