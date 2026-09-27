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
exports.ValidationExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const error_logger_service_1 = require("./error-logger.service");
let ValidationExceptionFilter = class ValidationExceptionFilter {
    errorLogger;
    constructor(errorLogger) {
        this.errorLogger = errorLogger;
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const requestId = String(request.headers['x-request-id'] ?? 'unknown');
        const errorPayload = exception.getResponse();
        const rawMessage = typeof errorPayload === 'object' && errorPayload && 'message' in errorPayload
            ? errorPayload.message
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
        if (typeof response.code === 'function') {
            response.code(400).send(payload);
            return;
        }
        if (typeof response.status === 'function') {
            response.status(400).send(payload);
            return;
        }
        const rawResponse = response;
        rawResponse.statusCode = 400;
        rawResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
        rawResponse.end(JSON.stringify(payload));
    }
};
exports.ValidationExceptionFilter = ValidationExceptionFilter;
exports.ValidationExceptionFilter = ValidationExceptionFilter = __decorate([
    (0, common_1.Injectable)(),
    (0, common_1.Catch)(common_1.BadRequestException),
    __metadata("design:paramtypes", [error_logger_service_1.ErrorLoggerService])
], ValidationExceptionFilter);
//# sourceMappingURL=validation-exception.filter.js.map