import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ErrorLoggerService } from './error-logger.service';

@Injectable()
export class SecurityLoggingInterceptor implements NestInterceptor {
  constructor(private readonly errorLogger: ErrorLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const requestId = String(req.headers['x-request-id'] ?? 'unknown');
    const ip = req.ip ?? 'unknown';

    return next.handle().pipe(
      tap(() => {
        this.errorLogger.log({
          event: 'security_event',
          statusCode: res?.statusCode ?? 200,
          requestId,
          method: req.method,
          path: req.originalUrl,
          ...(req.originalUrl ? { query: new URL(req.originalUrl, 'http://localhost').search } : {}),
          ip,
          ...(typeof req.headers['user-agent'] === 'string' ? { userAgent: req.headers['user-agent'] } : {}),
          ...(typeof req.headers.origin === 'string' ? { origin: req.headers.origin } : {}),
          errorCode: 'REQUEST_OK',
          errorType: 'info',
          message: 'Request completed',
        });
      }),
      catchError((error) => {
        this.errorLogger.log({
          event: 'http_exception',
          statusCode: error?.status ?? res?.statusCode ?? 500,
          requestId,
          method: req.method,
          path: req.originalUrl,
          ...(req.originalUrl ? { query: new URL(req.originalUrl, 'http://localhost').search } : {}),
          ip,
          ...(typeof req.headers['user-agent'] === 'string' ? { userAgent: req.headers['user-agent'] } : {}),
          ...(typeof req.headers.origin === 'string' ? { origin: req.headers.origin } : {}),
          errorCode: error?.response?.code ?? 'INTERNAL_SERVER_ERROR',
          errorType: error?.name ?? 'Error',
          message: error?.message ?? 'Unknown error',
          ...(error?.stack ? { stack: error.stack } : {}),
        });

        throw error;
      })
    );
  }
}
