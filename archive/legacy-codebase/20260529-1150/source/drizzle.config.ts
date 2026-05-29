import { defineConfig } from "drizzle-kit";
import { resolveSupabaseDatabaseUrl } from "./server/config/supabase-db";

// Drizzle Kit (push / generate / studio) must target the same Supabase DB the
// runtime uses. Resolving via the same helper guarantees both paths agree, and
// hard-fails rather than silently writing schema changes to the legacy Neon DB.
const databaseUrl = resolveSupabaseDatabaseUrl();

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
