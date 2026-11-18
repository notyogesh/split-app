"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_GROUP_COOKIE, requireUserId } from "@/lib/data";
import { notifyUsers, pushEnabled } from "@/lib/push";
import type { ActionResult } from "@/lib/schemas";

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 } as const;

const nameSchema = z.string().trim().min(1, "Enter your name").max(40);
const upiSchema = z
  .string()
  .trim()
  .regex(/^([A-Za-z0-9._-]{2,128}@[A-Za-z]{2,64})?$/, "That UPI ID doesn't look right (e.g. name@okaxis)");

export async function saveProfile(_: unknown, form: FormData): Promise<ActionResult> {
  const name = nameSchema.safeParse(form.get("name") ?? "");
  const upi = upiSchema.safeParse(form.get("upi_id") ?? "");
  if (!name.success) return { ok: false, error: name.error.issues[0].message };
  if (!upi.success) return { ok: false, error: upi.error.issues[0].message };
  await requireUserId();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_profile", { p_name: name.data, p_upi: upi.data });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, data: undefined };
}

/** Onboarding: save name, then create or join a group in one submit. */
export async function completeOnboarding(_: unknown, form: FormData): Promise<ActionResult> {
  const name = nameSchema.safeParse(form.get("name") ?? "");
  if (!name.success) return { ok: false, error: name.error.issues[0].message };
  const mode = form.get("mode");
  await requireUserId();
  const supabase = await createClient();

  const { error: pErr } = await supabase.rpc("update_profile", { p_name: name.data, p_upi: "" });
  if (pErr) return { ok: false, error: pErr.message };

  let groupId: string | null = null;
  if (mode === "join") {
    const raw = String(form.get("code") ?? "").trim();
    const code = raw.split("/").pop()?.toLowerCase() ?? "";
    if (!/^[0-9a-f]{12}$/.test(code)) return { ok: false, error: "Paste the invite link or 12-character code" };
    const { data, error } = await supabase.rpc("join_group", { p_code: code });
    if (error) return { ok: false, error: error.message };
    groupId = data as string;
  } else if (mode === "create") {
    const gname = z.string().trim().min(1, "Name your group").max(40).safeParse(form.get("group") ?? "");
    if (!gname.success) return { ok: false, error: gname.error.issues[0].message };
    const { data, error } = await supabase.rpc("create_group", { p_name: gname.data });
    if (error) return { ok: false, error: error.message };
    groupId = data as string;
  }

  if (groupId) (await cookies()).set(ACTIVE_GROUP_COOKIE, groupId, COOKIE_OPTS);
  redirect("/");
}

export async function createGroup(_: unknown, form: FormData): Promise<ActionResult> {
  const gname = z.string().trim().min(1, "Name your group").max(40).safeParse(form.get("group") ?? "");
  if (!gname.success) return { ok: false, error: gname.error.issues[0].message };
  await requireUserId();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group", { p_name: gname.data });
  if (error) return { ok: false, error: error.message };
  (await cookies()).set(ACTIVE_GROUP_COOKIE, data as string, COOKIE_OPTS);
  redirect("/");
}

export async function switchGroup(groupId: string) {
  if (!z.uuid().safeParse(groupId).success) return;
  (await cookies()).set(ACTIVE_GROUP_COOKIE, groupId, COOKIE_OPTS);
  refresh();
}

export async function resetInviteCode(groupId: string): Promise<ActionResult<string>> {
  if (!z.uuid().safeParse(groupId).success) return { ok: false, error: "Invalid group" };
  await requireUserId();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reset_invite_code", { p_group: groupId });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, data: data as string };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------- push

const subSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export async function savePushSubscription(sub: unknown): Promise<ActionResult> {
  const parsed = subSchema.safeParse(sub);
  if (!parsed.success) return { ok: false, error: "Invalid subscription" };
  const me = await requireUserId();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: me,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  });
  if (error) return { ok: false, error: "Couldn't save this device" };
  return { ok: true, data: undefined };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  await requireUserId();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true, data: undefined };
}

export async function sendTestPush(): Promise<ActionResult> {
  if (!pushEnabled()) return { ok: false, error: "Push isn't configured on the server" };
  const me = await requireUserId();
  await notifyUsers([me], { title: "Notifications are on 🎉", body: "You'll hear about new expenses here.", url: "/" });
  return { ok: true, data: undefined };
}
