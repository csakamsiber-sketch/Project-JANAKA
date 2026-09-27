-- Create the join table before changing Library ownership.
CREATE TABLE "ApplicationLibrary" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApplicationLibrary_pkey" PRIMARY KEY ("id")
);

-- Normalize legacy nullable ecosystems so the global identity is deterministic.
UPDATE "Library" SET "ecosystem" = 'unknown' WHERE "ecosystem" IS NULL;
ALTER TABLE "Library" ALTER COLUMN "ecosystem" SET DEFAULT 'unknown';
ALTER TABLE "Library" ALTER COLUMN "ecosystem" SET NOT NULL;

-- Keep one Library definition per name/version/ecosystem and preserve vulnerability links.
CREATE TEMP TABLE "LibraryDedupMap" AS
SELECT "id" AS "duplicateId",
       FIRST_VALUE("id") OVER (
         PARTITION BY "libraryName", "version", "ecosystem"
         ORDER BY "createdAt", "id"
       ) AS "canonicalId"
FROM "Library";

UPDATE "Vulnerability" AS vulnerability
SET "libraryId" = map."canonicalId"
FROM "LibraryDedupMap" AS map
WHERE vulnerability."libraryId" = map."duplicateId"
  AND map."duplicateId" <> map."canonicalId";

INSERT INTO "ApplicationLibrary" ("id", "applicationId", "libraryId", "source", "createdAt", "updatedAt")
SELECT DISTINCT ON (library."applicationId", map."canonicalId")
       md5(library."applicationId" || ':' || map."canonicalId"),
       library."applicationId",
       map."canonicalId",
       library."source",
       library."createdAt",
       library."updatedAt"
FROM "Library" AS library
JOIN "LibraryDedupMap" AS map ON map."duplicateId" = library."id"
ORDER BY library."applicationId", map."canonicalId", library."createdAt", library."id";

DELETE FROM "Library" AS library
USING "LibraryDedupMap" AS map
WHERE library."id" = map."duplicateId"
  AND map."duplicateId" <> map."canonicalId";

ALTER TABLE "Library" DROP CONSTRAINT "Library_applicationId_fkey";
DROP INDEX IF EXISTS "Library_applicationId_idx";
DROP INDEX IF EXISTS "Library_applicationId_libraryName_version_ecosystem_key";
ALTER TABLE "Library" DROP COLUMN "applicationId";
ALTER TABLE "Library" DROP COLUMN "source";

CREATE UNIQUE INDEX "Library_libraryName_version_ecosystem_key" ON "Library"("libraryName", "version", "ecosystem");
CREATE UNIQUE INDEX "ApplicationLibrary_applicationId_libraryId_key" ON "ApplicationLibrary"("applicationId", "libraryId");
CREATE INDEX "ApplicationLibrary_applicationId_idx" ON "ApplicationLibrary"("applicationId");
CREATE INDEX "ApplicationLibrary_libraryId_idx" ON "ApplicationLibrary"("libraryId");

ALTER TABLE "ApplicationLibrary" ADD CONSTRAINT "ApplicationLibrary_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationLibrary" ADD CONSTRAINT "ApplicationLibrary_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library"("id") ON DELETE CASCADE ON UPDATE CASCADE;
