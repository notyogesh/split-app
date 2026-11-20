import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

/** Group name for an invite code, shown on the sign-up page. Not exposed as an endpoint. */
export async function inviteGroupName(code: string): Promise<string | null> {
  if (!/^[0-9a-f]{12}$/.test(code)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("groups").select("name").eq("invite_code", code).maybeSingle();
  return data?.name ?? null;
}
