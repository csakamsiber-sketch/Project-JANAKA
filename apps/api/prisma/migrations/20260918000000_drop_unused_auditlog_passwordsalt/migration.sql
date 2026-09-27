-- Drop the AuditLog table and User.passwordSalt column: verified zero references
-- in application code (no writes, no reads) before removal.
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_actorId_fkey";
DROP TABLE IF EXISTS "AuditLog";
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordSalt";
