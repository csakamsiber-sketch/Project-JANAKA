# Threat model

## STRIDE summary

| Area | Threat | Mitigation |
|---|---|---|
| Authentication | credential stuffing, session hijack | secure sessions, rate limiting, audit logs |
| Authorization | IDOR / BOLA | server-side resource checks |
| Applications | tampering | validation and DB constraints |
| Meetings | doublebooking | exclusion checks and transaction logic |
| File uploads | malware/path traversal | content validation and safe storage |
| CTI / AI | prompt injection, SSRF | untrusted-document handling, schema validation |

## Residual risk

Residual risk remains in external integrations and vendor-supplied AI/OSINT workflows; all such processing must remain human-reviewed before impact assessment.
