CREATE TABLE "SuperadminDowngradeRequest" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedRole" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "SuperadminDowngradeRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuperadminDowngradeApproval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SuperadminDowngradeApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SuperadminDowngradeApproval_requestId_approverId_key" ON "SuperadminDowngradeApproval"("requestId", "approverId");
CREATE INDEX "SuperadminDowngradeRequest_targetId_status_expiresAt_idx" ON "SuperadminDowngradeRequest"("targetId", "status", "expiresAt");
CREATE INDEX "SuperadminDowngradeApproval_approverId_consumed_expiresAt_idx" ON "SuperadminDowngradeApproval"("approverId", "consumed", "expiresAt");
ALTER TABLE "SuperadminDowngradeRequest" ADD CONSTRAINT "SuperadminDowngradeRequest_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuperadminDowngradeRequest" ADD CONSTRAINT "SuperadminDowngradeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuperadminDowngradeApproval" ADD CONSTRAINT "SuperadminDowngradeApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SuperadminDowngradeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuperadminDowngradeApproval" ADD CONSTRAINT "SuperadminDowngradeApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;