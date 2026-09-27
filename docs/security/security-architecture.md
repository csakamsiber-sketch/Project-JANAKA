# Security architecture

## Core principles

- secure by design
- least privilege
- defense in depth
- fail closed
- zero trust
- explicit server-side authorization

## Threats addressed

- credential theft
- IDOR/BOLA
- CSRF/parameter pollution
- injection and prototype pollution
- SSRF and unsafe file processing
- brittle session handling

## Mitigations

- NestJS request validation using strict schemas and Zod
- server-side authorization checks and resource ownership validation
- Redis-backed rate limiting and request tracking
- strict security headers and CORS allowlist
- audit logging for sensitive actions
- concurrency-safe scheduling controls and database-enforced invariants
