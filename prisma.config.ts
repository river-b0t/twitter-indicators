import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // directUrl used for migrations (bypasses pgbouncer pooler)
  },
  datasource: {
    // Use DIRECT_URL for migrations; PrismaClient constructor uses DATABASE_URL (pooled)
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
