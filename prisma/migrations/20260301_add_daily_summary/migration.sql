CREATE TABLE "DailySummary" (
  "id"      TEXT NOT NULL,
  "date"    DATE NOT NULL,
  "scope"   TEXT NOT NULL,
  "content" JSONB NOT NULL,
  CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailySummary_date_scope_key" ON "DailySummary"("date", "scope");
