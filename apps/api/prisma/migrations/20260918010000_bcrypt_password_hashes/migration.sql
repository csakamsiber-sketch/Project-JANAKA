UPDATE "User"
SET "passwordHash" = '$2b$12$u8P1SGdUBpzLJrULzZRLYu5LZxFZQyweCQfkAHqRPKqODwnYwjT/u';

UPDATE "Session"
SET "revoked" = true
WHERE "revoked" = false;
