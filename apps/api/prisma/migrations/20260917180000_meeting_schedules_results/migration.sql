CREATE TABLE "MeetingSchedule" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "verificatorId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "purpose" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeetingSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MeetingResult" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passPoints" INTEGER NOT NULL,
    "needToFixPoints" INTEGER NOT NULL,
    "waitingPoints" INTEGER NOT NULL,
    "uncheckPoints" INTEGER NOT NULL,
    "totalPoints" INTEGER NOT NULL,
    "progressPercent" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "MeetingResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingResult_meetingId_phase_key" ON "MeetingResult"("meetingId", "phase");
CREATE INDEX "MeetingResult_meetingId_capturedAt_idx" ON "MeetingResult"("meetingId", "capturedAt");
CREATE INDEX "MeetingSchedule_verificatorId_startAt_idx" ON "MeetingSchedule"("verificatorId", "startAt");
CREATE INDEX "MeetingSchedule_applicationId_startAt_idx" ON "MeetingSchedule"("applicationId", "startAt");
ALTER TABLE "MeetingSchedule" ADD CONSTRAINT "MeetingSchedule_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingSchedule" ADD CONSTRAINT "MeetingSchedule_verificatorId_fkey" FOREIGN KEY ("verificatorId") REFERENCES "User"("id") ON UPDATE CASCADE;
ALTER TABLE "MeetingSchedule" ADD CONSTRAINT "MeetingSchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON UPDATE CASCADE;
ALTER TABLE "MeetingResult" ADD CONSTRAINT "MeetingResult_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
