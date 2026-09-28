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
exports.AuthenticationMiddleware = void 0;
const common_1 = require("@nestjs/common");
const auth_constants_1 = require("../auth/auth.constants");
const auth_service_1 = require("../auth/auth.service");
const request_cookies_1 = require("../common/request-cookies");
let AuthenticationMiddleware = class AuthenticationMiddleware {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async use(request, reply, next) {
        const requestPath = [request.url, request.originalUrl, request.raw?.url]
            .filter((value) => typeof value === 'string')
            .join(' ');
        const path = requestPath.split('?')[0] ?? '';
        if (request.method === 'OPTIONS' || /\/auth\/(login|login\/resend-otp|register|forgot-password|reset-password|refresh|change-password)$/.test(path) || path.endsWith('/internal/cron')) {
            next();
            return;
        }
        const cookies = (0, request_cookies_1.getRequestCookies)(request);
        const accessToken = (0, request_cookies_1.getRequestAccessToken)(request) ?? cookies[auth_constants_1.AUTH_COOKIE_NAME];
        const user = accessToken ? await this.authService.getPersistentUserBySession(accessToken) : undefined;
        if (!user) {
            const rawResponse = reply;
            rawResponse.statusCode = 401;
            rawResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
            rawResponse.end(JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.', requestId: request.headers['x-request-id'] ?? 'unknown' } }));
            return;
        }
        if (user.mustChangePassword && !/\/auth\/(change-password|logout)$/.test(path)) {
            const rawResponse = reply;
            rawResponse.statusCode = 403;
            rawResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
            rawResponse.end(JSON.stringify({ error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password before continuing.', requestId: request.headers['x-request-id'] ?? 'unknown' } }));
            return;
        }
        request.user = user;
        next();
    }
};
exports.AuthenticationMiddleware = AuthenticationMiddleware;
exports.AuthenticationMiddleware = AuthenticationMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthenticationMiddleware);
//# sourceMappingURL=authentication.middleware.js.map