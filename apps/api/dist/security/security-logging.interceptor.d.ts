import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ErrorLoggerService } from './error-logger.service';
export declare class SecurityLoggingInterceptor implements NestInterceptor {
    private readonly errorLogger;
    constructor(errorLogger: ErrorLoggerService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown>;
}
