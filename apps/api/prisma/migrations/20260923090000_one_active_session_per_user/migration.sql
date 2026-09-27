-- Keep historical revoked sessions, but allow only one active session per user.
WITH ranked_active_sessions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" DESC) AS row_number
  FROM "Session"
  WHERE revoked = false
)
UPDATE "Session" AS session
SET revoked = true
FROM ranked_active_sessions AS ranked
WHERE session.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX "Session_one_active_per_user"
ON "Session" ("userId")
WHERE revoked = false;