import { SsrfValidator } from './ssrf.validator';

describe('SsrfValidator', () => {
  it('rejects localhost and internal host access', () => {
    expect(SsrfValidator.validateUrl({ url: 'http://localhost:3000' }).valid).toBe(false);
    expect(SsrfValidator.validateUrl({ url: 'http://127.0.0.1:8080' }).valid).toBe(false);
  });

  it('allows public hosts when not blocked', () => {
    expect(SsrfValidator.validateUrl({ url: 'https://example.com' }).valid).toBe(true);
  });

  it('rejects cloud metadata, private, and IPv6 loopback targets', () => {
    expect(SsrfValidator.validateUrl({ url: 'http://169.254.169.254/latest/meta-data' }).valid).toBe(false);
    expect(SsrfValidator.validateUrl({ url: 'http://172.20.0.5/internal' }).valid).toBe(false);
    expect(SsrfValidator.validateUrl({ url: 'http://[::1]/' }).valid).toBe(false);
    expect(SsrfValidator.validateUrl({ url: 'javascript:alert(1)' }).valid).toBe(false);
  });
});
