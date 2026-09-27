import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorLoggerService } from './error-logger.service';

@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly errorLogger: ErrorLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const requestId = String(request.headers['x-request-id'] ?? 'unknown');
    const method = request.method ?? 'UNKNOWN';
    const path = request.url ?? 'unknown';
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawMessage =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error.' };

    const responseMessage = typeof rawMessage === 'string'
      ? rawMessage
      : typeof rawMessage === 'object' && rawMessage && 'message' in rawMessage
        ? (rawMessage as { message?: unknown }).message
        : undefined;

    const safeMessage = Array.isArray(responseMessage)
      ? 'Request validation failed.'
      : typeof responseMessage === 'string' && responseMessage.trim()
        ? status >= 500
          ? 'The server could not complete the request.'
          : responseMessage
        : status >= 500
          ? 'The server could not complete the request.'
          : 'The request could not be completed.';

    const errorId = this.errorLogger.log({
      event: exception instanceof HttpException ? 'http_exception' : 'unhandled_exception',
      statusCode: status,
      requestId,
      method,
      path,
      ...(request.url ? { query: new URL(request.url, 'http://localhost').search } : {}),
      ...(typeof request.ip === 'string' ? { ip: request.ip } : {}),
      ...(typeof request.headers['user-agent'] === 'string' ? { userAgent: request.headers['user-agent'] } : {}),
      ...(typeof request.headers.origin === 'string' ? { origin: request.headers.origin } : {}),
      errorCode: status >= 500 ? 'INTERNAL_SERVER_ERROR' : `HTTP_${status}`,
      errorType: exception instanceof Error ? exception.name : typeof exception,
      message: exception instanceof Error ? exception.message : String(exception),
      ...(exception instanceof Error && exception.stack ? { stack: exception.stack } : {}),
      details: {
        responseMessage: typeof responseMessage === 'string' ? responseMessage : undefined,
      },
    });

    const payload = {
      error: {
        code: status === HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_SERVER_ERROR' : `HTTP_${status}`,
        message: safeMessage,
        requestId,
        errorId,
      },
    };

    if (typeof (response as any).code === 'function') {
      (response as any).code(status).send(payload);
      return;
    }

    if (typeof (response as any).status === 'function') {
      (response as any).status(status).send(payload);
      return;
    }

    const rawResponse = response as unknown as { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void };
    rawResponse.statusCode = status;
    rawResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
    rawResponse.end(JSON.stringify(payload));
  }
}
