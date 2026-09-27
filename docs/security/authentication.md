# Authentication

## Model

- Prefer passkeys/WebAuthn.
- If passwords are used, use Argon2id and secure password policy.
- Use secure server-side sessions with HttpOnly, Secure, and SameSite cookie attributes.
- Rate limiting on login and password reset endpoints.

## Threats covered

- phishing-resistant attestations
- brute force
- session theft
- CSRF on cookie-based flows
