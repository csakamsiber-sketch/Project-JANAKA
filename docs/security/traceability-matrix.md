# Security control traceability matrix

| Control | Threat | OWASP / relevant standard | Testing |
|---|---|---|---|
| strict input validation | injection, mass assignment | ASVS V5, API Security | unit tests for duplicate keys and malicious payloads |
| server-side authorization | IDOR/BOLA | ASVS V4, API Security 1, 2 | RBAC tests and resource checks |
| CSRF protection | cross-site request forgery | ASVS V12, RFC 6265 | same-origin enforcement tests |
| security headers | XSS and clickjacking | ASVS V14, WSTG | header verification tests |
| request ID and structured logging | auditability and forensic review | ASVS V8 | log correlation tests |
| rate limiting | brute force and abuse | API Security 4, 5 | throttle tests |
| prototype pollution defense | poisoning of object shape | ASVS V5, WSTG | recursive payload tests |
| duplicate parameter rejection | parameter smuggling and ambiguity | API Security 2, WSTG | query/body edge-case tests |
| TLS 1.3 termination | MITM | RFC 8446 | deployment config checks |
