import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export type ErrorLogEvent = 'http_exception' | 'validation_exception' | 'unhandled_exception' | 'unhandled_rejection' | 'security_event';

export interface ErrorLogContext {
  event: ErrorLogEvent;
  statusCode?: number;
  requestId?: string;
  errorId?: string;
  method?: string;
  path?: string;
  query?: string;
  ip?: string;
  userAgent?: string;
  origin?: string;
  userId?: string;
  errorCode?: string;
  errorType?: string;
  message?: string;
  stack?: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class ErrorLoggerService {
  private readonly logger = new Logger('SecurityError');

  generateErrorId(): string {
    return randomUUID();
  }

  log(context: ErrorLogContext): string {
    const errorId = context.errorId ?? this.generateErrorId();
    const sanitized: Record<string, unknown> = {
      event: context.event,
      timestamp: new Date().toISOString(),
      errorId,
      requestId: context.requestId ?? 'unknown',
      statusCode: context.statusCode ?? 500,
      method: context.method ?? 'UNKNOWN',
      path: context.path ?? 'unknown',
      errorCode: context.errorCode ?? 'UNKNOWN',
      errorType: context.errorType ?? 'unknown',
      message: this.sanitizeMessage(context.message),
    };

    if (context.query) sanitized.query = context.query;
    if (context.ip) sanitized.ip = this.sanitizeValue(context.ip);
    if (context.userAgent) sanitized.userAgent = this.sanitizeValue(context.userAgent);
    if (context.origin) sanitized.origin = this.sanitizeValue(context.origin);
    if (context.userId) sanitized.userId = context.userId;
    if (process.env.NODE_ENV !== 'production' && context.stack) sanitized.stack = this.sanitizeStack(context.stack);
    if (context.details) sanitized.details = this.sanitizeDetails(context.details);

    this.logger.error(JSON.stringify(sanitized));
    return errorId;
  }

  private sanitizeValue(value?: string): string | undefined {
    if (!value) return undefined;
    return value.replace(/\s+/g, ' ').trim().slice(0, 512);
  }

  private sanitizeMessage(message?: string): string {
    const text = message?.trim() ?? 'Unknown error';
    if (!text) return 'Unknown error';
    const lower = text.toLowerCase();
    const sensitive = /(password|secret|token|cookie|authorization|session|fingerprint|otp|api[_-]?key|jwt|bearer)/i;
    if (sensitive.test(lower)) {
      return 'Sensitive error details redacted for security.';
    }
    return text.slice(0, 500);
  }

  private sanitizeStack(stack?: string): string | undefined {
    if (!stack) return undefined;
    return stack
      .split('\n')
      .slice(0, 10)
      .map((line) => line.replace(/(Authorization|Cookie|Set-Cookie|X-CSRF-Token|X-Fingerprint|password|token|secret|session)=.*$/gi, '$1=[REDACTED]'))
      .join('\n')
      .slice(0, 4000);
  }

  private sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!details) return undefined;
    return Object.fromEntries(
      Object.entries(details).map(([key, value]) => [
        key,
        typeof value === 'string'
          ? this.sanitizeMessage(value)
          : typeof value === 'object' && value && !Array.isArray(value)
            ? this.sanitizeDetails(value as Record<string, unknown>)
            : value,
      ]),
    );
  }
}
