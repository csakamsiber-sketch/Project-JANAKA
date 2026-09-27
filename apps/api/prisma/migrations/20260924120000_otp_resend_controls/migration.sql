ALTER TABLE "LoginChallenge"
  ADD COLUMN "resendCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resendAvailableAt" TIMESTAMP(3);

ALTER TABLE "AdminActionChallenge"
  ADD COLUMN "resendCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resendAvailableAt" TIMESTAMP(3);

ALTER TABLE "SuperadminDowngradeApproval"
  ADD COLUMN "resendCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "resendAvailableAt" TIMESTAMP(3);