"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestIdMiddleware = RequestIdMiddleware;
function RequestIdMiddleware(req, res, next) {
    const rawValue = req.headers['x-request-id'];
    const requestId = Array.isArray(rawValue) ? rawValue[0] ?? crypto.randomUUID() : (rawValue ?? crypto.randomUUID());
    const safeRequestId = String(requestId);
    res.setHeader('x-request-id', safeRequestId);
    req.headers['x-request-id'] = safeRequestId;
    next();
}
//# sourceMappingURL=request-id.middleware.js.map