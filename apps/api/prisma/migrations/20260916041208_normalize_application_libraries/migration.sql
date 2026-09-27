/*
  Warnings:

  - You are about to drop the column `libraries` on the `Application` table. All the data in the column will be lost.
  - You are about to drop the column `technologyStack` on the `Application` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Application" DROP COLUMN "libraries",
DROP COLUMN "technologyStack";

-- CreateTable
CREATE TABLE "Library" (
    "id" TEXT NOT NULL,
    "libraryName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "ecosystem" TEXT,
    "source" TEXT,
    "applicationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vulnerability" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "cve" TEXT,
    "severity" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "fixedVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vulnerability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Library_applicationId_idx" ON "Library"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Library_applicationId_libraryName_version_ecosystem_key" ON "Library"("applicationId", "libraryName", "version", "ecosystem");

-- CreateIndex
CREATE INDEX "Vulnerability_libraryId_idx" ON "Vulnerability"("libraryId");

-- CreateIndex
CREATE INDEX "Vulnerability_cve_idx" ON "Vulnerability"("cve");

-- AddForeignKey
ALTER TABLE "Library" ADD CONSTRAINT "Library_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vulnerability" ADD CONSTRAINT "Vulnerability_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library"("id") ON DELETE CASCADE ON UPDATE CASCADE;
