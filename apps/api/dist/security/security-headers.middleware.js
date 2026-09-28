"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityHeadersMiddleware = SecurityHeadersMiddleware;
const node_crypto_1 = require("node:crypto");
const request_origin_1 = require("./request-origin");
function SecurityHeadersMiddleware(req, res, next) {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    const allowedOrigins = (0, request_origin_1.getAllowedOrigins)();
    const nonce = (0, node_crypto_1.randomBytes)(16).toString('base64');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && Number(req.headers['content-length'] ?? 0) > 0) {
        const contentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : '';
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
            const rawResponse = res;
            rawResponse.statusCode = 415;
            rawResponse.setHeader('Content-Type', 'application/json; charset=utf-8');
            rawResponse.end?.(JSON.stringify({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'API request bodies must use application/json; charset=utf-8.' } }));
            return;
        }
    }
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', `default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.github.com; font-src 'self' data:;`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
}
//# sourceMappingURL=security-headers.middleware.js.map