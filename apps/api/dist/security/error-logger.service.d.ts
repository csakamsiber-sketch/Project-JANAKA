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
export declare class ErrorLoggerService {
    private readonly logger;
    generateErrorId(): string;
    log(context: ErrorLogContext): string;
    private sanitizeValue;
    private sanitizeMessage;
    private sanitizeStack;
    private sanitizeDetails;
}
