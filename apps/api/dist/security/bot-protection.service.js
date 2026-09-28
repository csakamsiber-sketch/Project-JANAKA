"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotProtectionService = void 0;
const common_1 = require("@nestjs/common");
let BotProtectionService = class BotProtectionService {
    async verify(token, ipAddress) {
        const secret = process.env.TURNSTILE_SECRET_KEY;
        const devBypass = process.env.NODE_ENV !== 'production' || process.env.TURNSTILE_DEV_BYPASS === 'true';
        if (!secret) {
            if (process.env.NODE_ENV === 'production')
                throw new common_1.UnauthorizedException('Bot protection is not configured.');
            return;
        }
        if (devBypass) {
            return;
        }
        if (!token)
            throw new common_1.UnauthorizedException('Complete the bot check before signing in.');
        let response;
        try {
            response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ secret, response: token, ...(ipAddress ? { remoteip: ipAddress } : {}) }),
                signal: AbortSignal.timeout(5_000),
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Bot check could not be verified. Please retry.');
        }
        const result = await response.json();
        if (!response.ok || !result.success)
            throw new common_1.UnauthorizedException('Bot check failed.');
    }
};
exports.BotProtectionService = BotProtectionService;
exports.BotProtectionService = BotProtectionService = __decorate([
    (0, common_1.Injectable)()
], BotProtectionService);
//# sourceMappingURL=bot-protection.service.js.map