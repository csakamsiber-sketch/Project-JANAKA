# Input validation

## Rules

- reject unknown JSON fields and duplicate keys
- reject duplicate query keys
- reject dangerous prototype keys and nested objects
- validate URL, header, file, and spreadsheet content against explicit schemas
- avoid naive mass assignment patterns

## Testing

Use automated security tests for payloads such as duplicate parameters, hidden prototype pollution keys, and XSS markup.
