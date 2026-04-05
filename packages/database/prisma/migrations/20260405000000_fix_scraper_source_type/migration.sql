-- AlterTable: convert scraper_jobs.source from Region enum to plain TEXT.
-- The Region enum constraint is no longer needed since scraper jobs can carry
-- arbitrary source labels (job-type names, file paths, etc.).

-- Step 1: Drop the composite index that references the source column.
DROP INDEX IF EXISTS "scraper_jobs_source_status_idx";

-- Step 2: Change the column type from Region enum to TEXT (data preserved).
ALTER TABLE "scraper_jobs" ALTER COLUMN "source" TYPE TEXT;

-- Step 3: Recreate the composite index.
CREATE INDEX "scraper_jobs_source_status_idx" ON "scraper_jobs"("source", "status");
