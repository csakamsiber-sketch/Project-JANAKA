import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class BotProtectionService {
  async verify(token: string | undefined, ipAddress?: string): Promise<void> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    const devBypass = process.env.NODE_ENV !== 'production' || process.env.TURNSTILE_DEV_BYPASS === 'true';

    if (!secret) {
      if (process.env.NODE_ENV === 'production') throw new UnauthorizedException('Bot protection is not configured.');
      return;
    }

    if (devBypass) {
      return;
    }

    if (!token) throw new UnauthorizedException('Complete the bot check before signing in.');

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, ...(ipAddress ? { remoteip: ipAddress } : {}) }),
    });
    const result = await response.json() as { success?: boolean };
    if (!response.ok || !result.success) throw new UnauthorizedException('Bot check failed.');
  }
}