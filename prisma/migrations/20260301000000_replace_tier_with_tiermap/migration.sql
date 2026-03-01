ALTER TABLE "TwitterAccount" DROP COLUMN "tier";
ALTER TABLE "TwitterAccount" ADD COLUMN "tierMap" JSONB NOT NULL DEFAULT '{}';
