import { ExceptionFilter, ArgumentsHost, BadRequestException } from '@nestjs/common';
import { ErrorLoggerService } from './error-logger.service';
export declare class ValidationExceptionFilter implements ExceptionFilter {
    private readonly errorLogger;
    constructor(errorLogger: ErrorLoggerService);
    catch(exception: BadRequestException, host: ArgumentsHost): void;
}
