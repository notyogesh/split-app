"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/data";
import { firstIssue, payloadSchema, type ActionResult, type ExpenseInput } from "@/lib/schemas";

export async function createRecurring(input: ExpenseInput, day: number): Promise<ActionResult<string>> {
  if (!Number.isInteger(day) || day < 1 || day > 28) return { ok: false, error: "Pick a day between 1 and 28" };
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await requireUserId();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_recurring", { p: parsed.data, p_day: day });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, data: data as string };
}

export async function setRecurring(id: string, active: boolean, remove = false): Promise<ActionResult> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid" };
  await requireUserId();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_recurring_active", { p_id: id, p_active: active, p_delete: remove });
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, data: undefined };
}
