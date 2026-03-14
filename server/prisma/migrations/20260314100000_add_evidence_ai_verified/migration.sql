-- AlterTable: add aiVerified to existing Evidence table (column was missing in DB)
ALTER TABLE "Evidence" ADD COLUMN "aiVerified" BOOLEAN NOT NULL DEFAULT 0;

-- Backfill: existing valid/invalid rows treated as already verified
UPDATE "Evidence" SET "aiVerified" = 1 WHERE "status" IN ('valid', 'invalid');
