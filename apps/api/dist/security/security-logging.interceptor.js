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
exports.SecurityLoggingInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
const error_logger_service_1 = require("./error-logger.service");
let SecurityLoggingInterceptor = class SecurityLoggingInterceptor {
    errorLogger;
    constructor(errorLogger) {
        this.errorLogger = errorLogger;
    }
    intercept(context, next) {
        const http = context.switchToHttp();
        const req = http.getRequest();
        const res = http.getResponse();
        const requestId = String(req.headers['x-request-id'] ?? 'unknown');
        const ip = req.ip ?? 'unknown';
        return next.handle().pipe((0, operators_1.tap)(() => {
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
        }), (0, operators_1.catchError)((error) => {
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
        }));
    }
};
exports.SecurityLoggingInterceptor = SecurityLoggingInterceptor;
exports.SecurityLoggingInterceptor = SecurityLoggingInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [error_logger_service_1.ErrorLoggerService])
], SecurityLoggingInterceptor);
//# sourceMappingURL=security-logging.interceptor.js.map