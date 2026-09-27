import { ExceptionFilter, Catch, ArgumentsHost, BadRequestException, Injectable } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorLoggerService } from './error-logger.service';

@Injectable()
@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  constructor(private readonly errorLogger: ErrorLoggerService) {}

  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const requestId = String(request.headers['x-request-id'] ?? 'unknown');
    const errorPayload = exception.getResponse();
    const rawMessage = typeof errorPayload === 'object' && errorPayload && 'message' in errorPayload
      ? (errorPayload as { message?: unknown }).message
      : undefined;

    this.errorLogger.log({
      event: 'validation_exception',
      statusCode: 400,
      requestId,
      method: request.method ?? 'UNKNOWN',
      path: request.url ?? 'unknown',
      ...(request.url ? { query: new URL(request.url, 'http://localhost').search } : {}),
      ...(typeof request.ip === 'string' ? { ip: request.ip } : {}),
      ...(typeof request.headers['user-agent'] === 'string' ? { userAgent: request.headers['user-agent'] } : {}),
      ...(typeof request.headers.origin === 'string' ? { origin: request.headers.origin } : {}),
      errorCode: 'VALIDATION_FAILED',
      errorType: exception.name,
      message: Array.isArray(rawMessage) ? 'Request validation failed.' : typeof rawMessage === 'string' ? rawMessage : 'Request validation failed.',
      details: { rawMessage },
    });

    const payload = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        requestId,
      },
    };

    if (typeof (response as any).code === 'function') {
      (response as any).code(400).send(payload);
      return;
    }

    if (typeof (response as any).status === 'function') {
      (response as any).status(400).send(payload);
      return;
    }

    const rawResponse = response as unknown as { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void };
    rawResponse.statusCode = 400;
    rawResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
    rawResponse.end(JSON.stringify(payload));
  }
}
