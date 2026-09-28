import { isAllowedRequestOrigin } from './request-origin';

describe('request origin validation', () => {
  it('accepts the deployed request origin without a fixed hostname allowlist', () => {
    expect(isAllowedRequestOrigin('https://janus.vercel.app', undefined, 'https://janus.vercel.app', [])).toBe(true);
  });

  it('does not accept a hostile hostname that merely starts with an allowed hostname', () => {
    expect(isAllowedRequestOrigin('https://janus.vercel.app.attacker.example', undefined, 'https://janus.vercel.app', ['https://janus.vercel.app'])).toBe(false);
  });
});
