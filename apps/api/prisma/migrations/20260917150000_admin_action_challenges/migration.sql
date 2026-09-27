CREATE TABLE "AdminActionChallenge" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminActionChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminActionChallenge_actorId_targetId_action_consumed_expiresAt_idx" ON "AdminActionChallenge"("actorId", "targetId", "action", "consumed", "expiresAt");
ALTER TABLE "AdminActionChallenge" ADD CONSTRAINT "AdminActionChallenge_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
