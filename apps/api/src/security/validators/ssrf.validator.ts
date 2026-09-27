import { isIP } from 'node:net';

export type NetworkTarget = {
  url: string;
  allowedHosts?: string[];
  disallowPrivateRanges?: boolean;
};

export class SsrfValidator {
  static isBlockedHost(hostname: string, allowedHosts: string[] = []): boolean {
    if (!hostname || typeof hostname !== 'string') return true;
    const normalized = hostname.trim().toLowerCase();
    if (!normalized) return true;
    if (allowedHosts.some((host) => host && host.trim().toLowerCase() === normalized)) {
      return false;
    }

    const ip = normalized.replace(/^\[|\]$/g, '');
    if (isIP(ip) === 4) {
      const octets = ip.split('.').map(Number);
      const [first = -1, second = -1] = octets;
      if (first === 0 || first === 10 || first === 127 || (first === 100 && second >= 64 && second <= 127) || (first === 169 && second === 254) || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31) return true;
    }
    if (isIP(ip) === 6 && (ip === '::' || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:') || ip.startsWith('::ffff:127.'))) return true;
    return normalized === 'localhost' || normalized.includes('internal') || normalized.endsWith('.local');
  }

  static validateUrl(target: NetworkTarget): { valid: boolean; reason?: string } {
    if (!target || typeof target !== 'object') {
      return { valid: false, reason: 'Invalid target payload' };
    }

    if (!target.url || typeof target.url !== 'string') {
      return { valid: false, reason: 'URL is required' };
    }

    let parsed: URL;
    try {
      parsed = new URL(target.url);
    } catch {
      return { valid: false, reason: 'Malformed URL' };
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, reason: 'Only http and https protocols are allowed' };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (this.isBlockedHost(hostname, target.allowedHosts ?? [])) {
      return { valid: false, reason: 'Blocked or private host detected' };
    }

    if (target.disallowPrivateRanges !== false && parsed.hostname.includes('localhost')) {
      return { valid: false, reason: 'Localhost is not allowed' };
    }

    return { valid: true };
  }
}
