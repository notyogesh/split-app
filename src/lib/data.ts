import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Group, Member, Profile } from "@/lib/types";

export const ACTIVE_GROUP_COOKIE = "gid";

/** The signed-in user's id, verified from the JWT. Redirects to /login if missing. */
export const requireUserId = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) redirect("/login");
  return sub;
});

export const getMyProfile = cache(async (): Promise<Profile> => {
  const userId = await requireUserId();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, name, upi_id")
    .eq("id", userId)
    .single();
  return data ?? { id: userId, name: "", upi_id: null };
});

export const getMyGroups = cache(async (): Promise<Group[]> => {
  const userId = await requireUserId();
  const supabase = await createClient();
  const { data } = await supabase
    .from("group_members")
    .select("joined_at, groups(id, name, invite_code, currency)")
    .eq("user_id", userId)
    .order("joined_at");
  return (data ?? []).flatMap((r) => (r.groups ? [r.groups as unknown as Group] : []));
});

/**
 * The group the user is working in. Sends them to onboarding if they have no
 * name yet or no group.
 */
export const requireActiveGroup = cache(async (): Promise<Group> => {
  const [profile, groups] = await Promise.all([getMyProfile(), getMyGroups()]);
  if (!profile.name) redirect("/onboarding");
  if (groups.length === 0) redirect("/onboarding");
  const wanted = (await cookies()).get(ACTIVE_GROUP_COOKIE)?.value;
  return groups.find((g) => g.id === wanted) ?? groups[0];
});

export const getMembers = cache(async (groupId: string): Promise<Member[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("group_members")
    .select("role, joined_at, profiles(id, name, upi_id)")
    .eq("group_id", groupId)
    .order("joined_at");
  return (data ?? []).flatMap((r) => {
    const p = r.profiles as unknown as Profile | null;
    return p ? [{ ...p, role: r.role as Member["role"] }] : [];
  });
});
