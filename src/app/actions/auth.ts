"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { ACTIVE_GROUP_COOKIE, requireUserId } from "@/lib/data";
import type { ActionResult } from "@/lib/schemas";

const email = z.email("Enter a valid email").trim().toLowerCase().max(254);
const password = z.string().min(8, "Password needs at least 8 characters").max(72, "Password is too long");
const inviteCode = z.string().trim().toLowerCase().regex(/^[0-9a-f]{12}$/, "Invalid invite link");

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 } as const;

function safeNext(raw: FormDataEntryValue | null) {
  const s = typeof raw === "string" ? raw : "/";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

/** Email + password sign-in. The session cookie lasts until the user signs out. */
export async function signIn(_: unknown, form: FormData): Promise<ActionResult> {
  const e = email.safeParse(form.get("email") ?? "");
  const p = z.string().min(1, "Enter your password").safeParse(form.get("password") ?? "");
  if (!e.success) return { ok: false, error: e.error.issues[0].message };
  if (!p.success) return { ok: false, error: p.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: e.data, password: p.data });
  if (error) {
    if (error.code === "invalid_credentials") return { ok: false, error: "Wrong email or password." };
    if (error.status === 429) return { ok: false, error: "Too many attempts. Wait a minute and try again." };
    return { ok: false, error: "Couldn't sign in. Try again." };
  }
  redirect(safeNext(form.get("next")));
}

/**
 * Invite-only sign-up: creates the account (already confirmed, so no email is sent),
 * signs in, and joins the group. Public sign-ups can stay disabled in Supabase.
 */
export async function signUpWithInvite(_: unknown, form: FormData): Promise<ActionResult> {
  const code = inviteCode.safeParse(form.get("code") ?? "");
  const name = z.string().trim().min(1, "Enter your name").max(40).safeParse(form.get("name") ?? "");
  const e = email.safeParse(form.get("email") ?? "");
  const p = password.safeParse(form.get("password") ?? "");
  if (!code.success) return { ok: false, error: code.error.issues[0].message };
  if (!name.success) return { ok: false, error: name.error.issues[0].message };
  if (!e.success) return { ok: false, error: e.error.issues[0].message };
  if (!p.success) return { ok: false, error: p.error.issues[0].message };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Sign-up isn't configured on the server." };

  const { data: group } = await admin.from("groups").select("id").eq("invite_code", code.data).maybeSingle();
  if (!group) return { ok: false, error: "This invite link is no longer valid. Ask for a new one." };

  const { error: createErr } = await admin.auth.admin.createUser({
    email: e.data,
    password: p.data,
    email_confirm: true,
    user_metadata: { name: name.data },
  });
  if (createErr) {
    if (createErr.code === "email_exists" || createErr.code === "user_already_exists")
      return { ok: false, error: "This email already has an account. Sign in instead." };
    if (createErr.code === "weak_password") return { ok: false, error: "Pick a stronger password." };
    return { ok: false, error: "Couldn't create your account. Try again." };
  }

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email: e.data, password: p.data });
  if (signInErr) return { ok: false, error: "Account created. Please sign in." };

  const { data: groupId, error: joinErr } = await supabase.rpc("join_group", { p_code: code.data });
  if (!joinErr && groupId) (await cookies()).set(ACTIVE_GROUP_COOKIE, groupId as string, COOKIE_OPTS);
  redirect("/");
}

/** Signed-in user sets or changes their own password. */
export async function changePassword(_: unknown, form: FormData): Promise<ActionResult> {
  const p = password.safeParse(form.get("password") ?? "");
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  if (form.get("confirm") !== p.data) return { ok: false, error: "The two passwords don't match." };
  await requireUserId();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: p.data });
  if (error) {
    if (error.code === "same_password") return { ok: false, error: "That's already your password." };
    if (error.code === "weak_password") return { ok: false, error: "Pick a stronger password." };
    return { ok: false, error: "Couldn't change the password. Try again." };
  }
  return { ok: true, data: undefined };
}

/** A group admin sets a temporary password for a member of one of their groups. */
export async function adminResetPassword(memberId: string, newPassword: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(memberId).success) return { ok: false, error: "Invalid member" };
  const p = password.safeParse(newPassword);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };

  const me = await requireUserId();
  if (memberId === me) return { ok: false, error: "Use “Change password” for your own account." };
  const supabase = await createClient();

  // Groups where I'm admin (RLS lets me read my own groups' member lists).
  const { data: mine } = await supabase.from("group_members").select("group_id").eq("user_id", me).eq("role", "admin");
  const adminGroups = (mine ?? []).map((r) => r.group_id);
  if (adminGroups.length === 0) return { ok: false, error: "Only a group admin can do this." };
  const { data: shared } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", memberId)
    .in("group_id", adminGroups)
    .limit(1);
  if (!shared?.length) return { ok: false, error: "That person isn't in a group you manage." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Not configured on the server." };
  const { error } = await admin.auth.admin.updateUserById(memberId, { password: p.data });
  if (error) return { ok: false, error: "Couldn't reset the password. Try again." };
  return { ok: true, data: undefined };
}
