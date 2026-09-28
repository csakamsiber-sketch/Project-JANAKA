"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINGERPRINT_PEPPER = exports.JWT_SECRET = exports.IS_SECURE_COOKIE = exports.AUTH_COOKIE_SAME_SITE = exports.REFRESH_COOKIE_PATH = exports.CSRF_COOKIE_MAX_AGE_MS = exports.REFRESH_COOKIE_MAX_AGE_MS = exports.AUTH_COOKIE_MAX_AGE_MS = exports.AUTH_FINGERPRINT_COOKIE_NAME = exports.AUTH_CSRF_COOKIE_NAME = exports.AUTH_REFRESH_COOKIE_NAME = exports.AUTH_COOKIE_NAME = void 0;
exports.AUTH_COOKIE_NAME = 'janus_session';
exports.AUTH_REFRESH_COOKIE_NAME = 'janus_refresh';
exports.AUTH_CSRF_COOKIE_NAME = 'janus_csrf';
exports.AUTH_FINGERPRINT_COOKIE_NAME = 'janus_fp';
exports.AUTH_COOKIE_MAX_AGE_MS = 1000 * 60 * 15;
exports.REFRESH_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
exports.CSRF_COOKIE_MAX_AGE_MS = exports.REFRESH_COOKIE_MAX_AGE_MS;
exports.REFRESH_COOKIE_PATH = process.env.VERCEL ? '/' : '/api/v1/auth/refresh';
exports.AUTH_COOKIE_SAME_SITE = 'strict';
exports.IS_SECURE_COOKIE = process.env.NODE_ENV === 'production';
exports.JWT_SECRET = process.env.JWT_SECRET ?? 'jamus-kalimasada-super-secret-change-me';
exports.FINGERPRINT_PEPPER = process.env.FINGERPRINT_PEPPER ?? exports.JWT_SECRET;
//# sourceMappingURL=auth.constants.js.map