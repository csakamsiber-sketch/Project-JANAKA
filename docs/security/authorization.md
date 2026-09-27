# Authorization

## Model

Authorization checks are mandatory in every controller/service boundary and on every resource access.

## Rules

- never trust client-supplied roles or ownership data
- enforce resource-level access checks using server-side DB queries
- support least privilege and explicit role checks for SUPERADMIN, OVERSEER, VERIFICATOR, and PIC
- deny by default when a resource or relation is missing
