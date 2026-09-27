"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const error_logger_service_1 = require("./error-logger.service");
let HttpExceptionFilter = class HttpExceptionFilter {
    errorLogger;
    constructor(errorLogger) {
        this.errorLogger = errorLogger;
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const requestId = String(request.headers['x-request-id'] ?? 'unknown');
        const method = request.method ?? 'UNKNOWN';
        const path = request.url ?? 'unknown';
        const status = exception instanceof common_1.HttpException
            ? exception.getStatus()
            : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        const rawMessage = exception instanceof common_1.HttpException
            ? exception.getResponse()
            : { message: 'Internal server error.' };
        const responseMessage = typeof rawMessage === 'string'
            ? rawMessage
            : typeof rawMessage === 'object' && rawMessage && 'message' in rawMessage
                ? rawMessage.message
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
            event: exception instanceof common_1.HttpException ? 'http_exception' : 'unhandled_exception',
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
                code: status === common_1.HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_SERVER_ERROR' : `HTTP_${status}`,
                message: safeMessage,
                requestId,
                errorId,
            },
        };
        if (typeof response.code === 'function') {
            response.code(status).send(payload);
            return;
        }
        if (typeof response.status === 'function') {
            response.status(status).send(payload);
            return;
        }
        const rawResponse = response;
        rawResponse.statusCode = status;
        rawResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
        rawResponse.end(JSON.stringify(payload));
    }
};
exports.HttpExceptionFilter = HttpExceptionFilter;
exports.HttpExceptionFilter = HttpExceptionFilter = __decorate([
    (0, common_1.Injectable)(),
    (0, common_1.Catch)(),
    __metadata("design:paramtypes", [error_logger_service_1.ErrorLoggerService])
], HttpExceptionFilter);
//# sourceMappingURL=http-exception.filter.js.map