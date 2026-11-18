/**
 * All config is read on the server under plain names (no NEXT_PUBLIC_ prefix),
 * so nothing is baked into the browser bundle. The only values sent to the
 * browser are the Supabase URL + publishable key (designed to be public; data
 * is protected by RLS) and the VAPID public key — passed at runtime as props.
 *
 * Supabase names match what the Vercel ↔ Supabase integration creates.
 */

export function supabaseUrl(): string {
  const v = process.env.SUPABASE_URL;
  if (!v) throw new Error("Missing env SUPABASE_URL");
  return v;
}

export function supabasePublishableKey(): string {
  const v = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!v) throw new Error("Missing env SUPABASE_PUBLISHABLE_KEY");
  return v;
}

/** For the browser. Empty strings (not a throw) so static pages can build without env. */
export function publicSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL ?? "",
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
  };
}

export function supabaseSecretKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY;
}

/** Public URL of the app, for invite links. Falls back to Vercel's production domain. */
export function siteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "";
}

export function vapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

export function googleLoginEnabled(): boolean {
  return process.env.ENABLE_GOOGLE_LOGIN === "true";
}
