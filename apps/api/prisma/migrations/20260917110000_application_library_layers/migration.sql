ALTER TABLE "ApplicationLibrary" ADD COLUMN "layer" TEXT NOT NULL DEFAULT 'backend';

DROP INDEX IF EXISTS "ApplicationLibrary_applicationId_libraryId_key";
CREATE UNIQUE INDEX "ApplicationLibrary_applicationId_libraryId_layer_key" ON "ApplicationLibrary"("applicationId", "libraryId", "layer");
