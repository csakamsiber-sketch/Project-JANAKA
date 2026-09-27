import { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { ErrorLoggerService } from './error-logger.service';
export declare class HttpExceptionFilter implements ExceptionFilter {
    private readonly errorLogger;
    constructor(errorLogger: ErrorLoggerService);
    catch(exception: unknown, host: ArgumentsHost): void;
}
