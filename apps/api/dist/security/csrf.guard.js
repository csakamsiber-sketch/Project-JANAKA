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
exports.CSRFGuard = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const auth_constants_1 = require("../auth/auth.constants");
const auth_service_1 = require("../auth/auth.service");
const request_cookies_1 = require("../common/request-cookies");
const auth_constants_2 = require("../auth/auth.constants");
const request_origin_1 = require("./request-origin");
let CSRFGuard = class CSRFGuard {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async use(req, res, next) {
        const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
        const referer = typeof req.headers.referer === 'string' ? req.headers.referer : undefined;
        const forwardedHost = this.firstHeaderValue(req.headers['x-forwarded-host']);
        const requestHost = forwardedHost ?? req.hostname ?? this.firstHeaderValue(req.headers.host);
        const forwardedProtocol = this.firstHeaderValue(req.headers['x-forwarded-proto']);
        const requestProtocol = forwardedProtocol ?? req.protocol ?? (req.raw?.socket?.encrypted ? 'https' : 'http');
        const requestOrigin = requestHost ? `${requestProtocol.split(',')[0]}://${requestHost}` : undefined;
        const allowedOrigins = (0, request_origin_1.getAllowedOrigins)();
        const isAllowedOrigin = (0, request_origin_1.isAllowedRequestOrigin)(origin, referer, requestOrigin, allowedOrigins);
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            const requestPath = [req.url, req.originalUrl, req.raw?.url, req.routerPath, req.routeOptions?.url]
                .filter((value) => typeof value === 'string')
                .join(' ');
            const csrfExempt = /\/auth\/(login|login\/resend-otp|refresh|register|forgot-password|reset-password)(?:[/?]|$)/.test(requestPath);
            if (csrfExempt) {
                return next();
            }
            const cookies = req.cookies ?? {};
            const csrfCookie = cookies[auth_constants_1.AUTH_CSRF_COOKIE_NAME] ?? this.readCookie(req.headers.cookie, auth_constants_1.AUTH_CSRF_COOKIE_NAME);
            const csrfHeader = typeof req.headers['x-csrf-token'] === 'string' ? req.headers['x-csrf-token'] : undefined;
            const accessToken = (0, request_cookies_1.getRequestAccessToken)(req) ?? (0, request_cookies_1.getRequestCookies)(req)[auth_constants_2.AUTH_COOKIE_NAME];
            const replacementToken = this.createToken();
            const consumed = accessToken && await this.authService.consumeCsrfToken(accessToken, csrfCookie, csrfHeader, replacementToken);
            if (!consumed) {
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                return res.end(JSON.stringify({ error: { code: 'CSRF_TOKEN_INVALID', message: 'A valid CSRF token header is required.', requestId: req.headers['x-request-id'] ?? 'unknown' } }));
            }
            this.setCsrfCookie(res, replacementToken);
            if (!isAllowedOrigin) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Vary', 'Origin');
                res.statusCode = 403;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                return res.end(JSON.stringify({
                    error: {
                        code: 'CSRF_FORBIDDEN',
                        message: 'Cross-site request rejected.',
                        requestId: req.headers['x-request-id'] ?? 'unknown',
                    },
                }));
            }
            if (origin && isAllowedOrigin) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Access-Control-Allow-Credentials', 'true');
                res.setHeader('Vary', 'Origin');
            }
        }
        if (req.method === 'OPTIONS') {
            if (origin && isAllowedOrigin)
                res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-Fingerprint');
            res.statusCode = 204;
            return res.end();
        }
        next();
    }
    firstHeaderValue(value) {
        if (typeof value === 'string')
            return value.split(',')[0]?.trim();
        if (Array.isArray(value) && typeof value[0] === 'string')
            return value[0].split(',')[0]?.trim();
        return undefined;
    }
    createToken() {
        return (0, node_crypto_1.randomBytes)(32).toString('hex');
    }
    readCookie(header, name) {
        if (typeof header !== 'string')
            return undefined;
        return header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
    }
    setCsrfCookie(res, token) {
        if (typeof res.setCookie === 'function') {
            res.setCookie(auth_constants_1.AUTH_CSRF_COOKIE_NAME, token, {
                httpOnly: false,
                secure: auth_constants_1.IS_SECURE_COOKIE,
                sameSite: auth_constants_1.AUTH_COOKIE_SAME_SITE,
                maxAge: auth_constants_1.CSRF_COOKIE_MAX_AGE_MS / 1000,
                path: '/',
            });
            return;
        }
        const cookie = [
            `${auth_constants_1.AUTH_CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`,
            `Max-Age=${Math.floor(auth_constants_1.CSRF_COOKIE_MAX_AGE_MS / 1000)}`,
            'Path=/',
            `SameSite=${auth_constants_1.AUTH_COOKIE_SAME_SITE}`,
            ...(auth_constants_1.IS_SECURE_COOKIE ? ['Secure'] : []),
        ].join('; ');
        const existing = res.getHeader?.('Set-Cookie');
        const setCookie = Array.isArray(existing) ? [...existing, cookie] : existing ? [String(existing), cookie] : [cookie];
        res.setHeader('Set-Cookie', setCookie);
    }
};
exports.CSRFGuard = CSRFGuard;
exports.CSRFGuard = CSRFGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], CSRFGuard);
//# sourceMappingURL=csrf.guard.js.map