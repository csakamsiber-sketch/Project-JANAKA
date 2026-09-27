"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestCookies = getRequestCookies;
exports.getRequestAccessToken = getRequestAccessToken;
function getRequestCookies(request) {
    if (request.cookies && Object.keys(request.cookies).length > 0) {
        return Object.entries(request.cookies).reduce((cookies, [name, value]) => {
            if (value !== undefined)
                cookies[name] = value;
            return cookies;
        }, {});
    }
    return (request.headers.cookie ?? '').split(';').reduce((cookies, part) => {
        const separator = part.indexOf('=');
        if (separator > 0) {
            const name = part.slice(0, separator).trim();
            const value = part.slice(separator + 1).trim();
            if (name && value)
                cookies[name] = value;
        }
        return cookies;
    }, {});
}
function getRequestAccessToken(request) {
    const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization;
    if (typeof authorization !== 'string')
        return undefined;
    const [scheme, token] = authorization.trim().split(/\s+/);
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
//# sourceMappingURL=request-cookies.js.map