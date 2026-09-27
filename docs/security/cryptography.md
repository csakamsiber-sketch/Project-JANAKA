# Cryptography

## Intended architecture

- TLS 1.3 terminates at the reverse proxy or ingress.
- Application-layer encryption only for sensitive fields that must remain confidential beyond TLS termination.
- Use AEAD primitives from standard libraries such as AES-GCM or ChaCha20-Poly1305 via Web Crypto and supported Node.js APIs.

## Rules

- Never implement custom encryption routines.
- Never log raw secrets, private keys, or credentials.
- Keep key material in a secret manager, not source control.
- Prefer server-side envelope encryption for selected confidential fields.
