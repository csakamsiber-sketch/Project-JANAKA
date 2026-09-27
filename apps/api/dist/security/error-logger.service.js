"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorLoggerService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
let ErrorLoggerService = class ErrorLoggerService {
    logger = new common_1.Logger('SecurityError');
    generateErrorId() {
        return (0, node_crypto_1.randomUUID)();
    }
    log(context) {
        const errorId = context.errorId ?? this.generateErrorId();
        const sanitized = {
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
        if (context.query)
            sanitized.query = context.query;
        if (context.ip)
            sanitized.ip = this.sanitizeValue(context.ip);
        if (context.userAgent)
            sanitized.userAgent = this.sanitizeValue(context.userAgent);
        if (context.origin)
            sanitized.origin = this.sanitizeValue(context.origin);
        if (context.userId)
            sanitized.userId = context.userId;
        if (process.env.NODE_ENV !== 'production' && context.stack)
            sanitized.stack = this.sanitizeStack(context.stack);
        if (context.details)
            sanitized.details = this.sanitizeDetails(context.details);
        this.logger.error(JSON.stringify(sanitized));
        return errorId;
    }
    sanitizeValue(value) {
        if (!value)
            return undefined;
        return value.replace(/\s+/g, ' ').trim().slice(0, 512);
    }
    sanitizeMessage(message) {
        const text = message?.trim() ?? 'Unknown error';
        if (!text)
            return 'Unknown error';
        const lower = text.toLowerCase();
        const sensitive = /(password|secret|token|cookie|authorization|session|fingerprint|otp|api[_-]?key|jwt|bearer)/i;
        if (sensitive.test(lower)) {
            return 'Sensitive error details redacted for security.';
        }
        return text.slice(0, 500);
    }
    sanitizeStack(stack) {
        if (!stack)
            return undefined;
        return stack
            .split('\n')
            .slice(0, 10)
            .map((line) => line.replace(/(Authorization|Cookie|Set-Cookie|X-CSRF-Token|X-Fingerprint|password|token|secret|session)=.*$/gi, '$1=[REDACTED]'))
            .join('\n')
            .slice(0, 4000);
    }
    sanitizeDetails(details) {
        if (!details)
            return undefined;
        return Object.fromEntries(Object.entries(details).map(([key, value]) => [
            key,
            typeof value === 'string'
                ? this.sanitizeMessage(value)
                : typeof value === 'object' && value && !Array.isArray(value)
                    ? this.sanitizeDetails(value)
                    : value,
        ]));
    }
};
exports.ErrorLoggerService = ErrorLoggerService;
exports.ErrorLoggerService = ErrorLoggerService = __decorate([
    (0, common_1.Injectable)()
], ErrorLoggerService);
//# sourceMappingURL=error-logger.service.js.map