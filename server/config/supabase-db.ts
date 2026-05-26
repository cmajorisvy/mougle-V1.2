const SUPABASE_PROJECT_REF = "commiqirdcgwagdmmvvm";
const SUPABASE_POOLER_HOST = "aws-1-us-east-1.pooler.supabase.com";
const SUPABASE_POOLER_PORT = 5432;

const NEON_HOST_FRAGMENTS = ["neon.tech", "neondb"];

export function resolveSupabaseDatabaseUrl(): string {
  const pwd = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!pwd) {
    throw new Error(
      "[db] SUPABASE_DB_PASSWORD is required. Mougle's source of truth is Supabase " +
        "(project " +
        SUPABASE_PROJECT_REF +
        "). Refusing to fall back to DATABASE_URL because that may still point at " +
        "the legacy Neon database. Set SUPABASE_DB_PASSWORD to proceed.",
    );
  }

  const encoded = encodeURIComponent(pwd);
  // No sslmode in URL — node-postgres treats `require` as `verify-full` and rejects
  // Supabase's pooler chain. TLS is still enforced via the Pool's `ssl` option in db.ts.
  const url =
    `postgresql://postgres.${SUPABASE_PROJECT_REF}:${encoded}` +
    `@${SUPABASE_POOLER_HOST}:${SUPABASE_POOLER_PORT}/postgres`;

  // Defence-in-depth: refuse to ever return a Neon URL from this resolver.
  for (const frag of NEON_HOST_FRAGMENTS) {
    if (url.includes(frag)) {
      throw new Error(
        "[db] Refusing to use a Neon host (" + frag + ") for the Supabase resolver",
      );
    }
  }

  return url;
}
