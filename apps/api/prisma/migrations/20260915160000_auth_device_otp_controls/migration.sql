ALTER TABLE "User" ADD COLUMN "deviceFingerprintHash" TEXT;
ALTER TABLE "LoginChallenge" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "LoginChallenge" ADD COLUMN "temporaryTokenHash" TEXT;
ALTER TABLE "LoginChallenge" ADD COLUMN "temporaryExpiresAt" TIMESTAMP(3);
ALTER TABLE "LoginChallenge" ADD COLUMN "cooldownUntil" TIMESTAMP(3);
ALTER TABLE "LoginChallenge" ADD COLUMN "consumedAt" TIMESTAMP(3);
ALTER TABLE "LoginChallenge" ADD COLUMN "invalidatedAt" TIMESTAMP(3);
ALTER TABLE "LoginChallenge" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "LoginChallenge_temporaryTokenHash_key" ON "LoginChallenge"("temporaryTokenHash");