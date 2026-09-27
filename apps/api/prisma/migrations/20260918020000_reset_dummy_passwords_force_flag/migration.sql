UPDATE "User"
SET "passwordHash" = '$2b$12$fEbGulOfbQoqvPwAczRzU.JTIrPfuGU3CyhZIBOnTLFYS0rvNUbAa',
    "mustChangePassword" = false;

UPDATE "Session"
SET "revoked" = true
WHERE "revoked" = false;
