"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { dbError, firstIssue, payloadSchema, uuid, type ActionResult, type ExpenseInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { notifyUsers } from "@/lib/push";

export async function createExpense(input: ExpenseInput): Promise<ActionResult<string>> {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const me = await requireUserId();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_expense", { p: parsed.data });
  if (error) return { ok: false, error: dbError(error.message) };

  const p = parsed.data;
  if (p.visibility !== "private") {
    const others = new Set<string>([p.paid_by, ...p.splits.map((s) => s.user_id), ...p.viewers]);
    if (p.visibility === "group") {
      const { data: members } = await supabase.from("group_members").select("user_id").eq("group_id", p.group_id);
      members?.forEach((m) => others.add(m.user_id));
    }
    others.delete(me);
    const { data: prof } = await supabase.from("profiles").select("name").eq("id", me).single();
    after(() =>
      Promise.all(
        [...others].map((uid) => {
          const share = p.splits.find((s) => s.user_id === uid)?.share_paise;
          return notifyUsers([uid], {
            title: `${prof?.name ?? "Someone"} added ${formatMoney(p.amount_paise)}`,
            body: share ? `${p.title} · your share ${formatMoney(share)}` : p.title,
            url: `/expenses/${data}`,
            tag: `expense-${data}`,
          });
        }),
      ),
    );
  }

  refresh();
  return { ok: true, data: data as string };
}

export async function updateExpense(id: string, input: Omit<ExpenseInput, "group_id"> & { group_id?: string }): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid expense" };
  const parsed = payloadSchema.omit({ group_id: true }).safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const me = await requireUserId();
  const supabase = await createClient();

  const { error } = await supabase.rpc("update_expense", { p_id: id, p_in: parsed.data });
  if (error) return { ok: false, error: dbError(error.message) };

  const others = new Set([parsed.data.paid_by, ...parsed.data.splits.map((s) => s.user_id)]);
  others.delete(me);
  if (parsed.data.visibility !== "private") {
    after(() =>
      notifyUsers([...others], {
        title: "An expense you're in was edited",
        body: `${parsed.data.title} · now ${formatMoney(parsed.data.amount_paise)}`,
        url: `/expenses/${id}`,
        tag: `expense-${id}`,
      }),
    );
  }
  refresh();
  return { ok: true, data: undefined };
}

export async function deleteExpense(id: string, restore = false): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid expense" };
  await requireUserId();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_expense", { p_id: id, p_restore: restore });
  if (error) return { ok: false, error: dbError(error.message) };
  refresh();
  return { ok: true, data: undefined };
}

export async function setSplitStatus(expenseId: string, userId: string, paid: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(expenseId).success || !uuid.safeParse(userId).success)
    return { ok: false, error: "Invalid input" };
  const me = await requireUserId();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_split_status", {
    p_expense: expenseId,
    p_user: userId,
    p_paid: paid,
  });
  if (error) return { ok: false, error: dbError(error.message) };

  const { data: e } = await supabase.from("expenses").select("title, paid_by").eq("id", expenseId).single();
  const { data: prof } = await supabase.from("profiles").select("name").eq("id", me).single();
  if (e) {
    const target = me === e.paid_by ? userId : e.paid_by;
    after(() =>
      notifyUsers([target], {
        title: `${prof?.name ?? "Someone"} marked a share ${paid ? "paid ✅" : "unpaid"}`,
        body: e.title,
        url: `/expenses/${expenseId}`,
      }),
    );
  }
  refresh();
  return { ok: true, data: undefined };
}

export async function settleUp(groupId: string, otherId: string): Promise<ActionResult<number>> {
  if (!uuid.safeParse(groupId).success || !uuid.safeParse(otherId).success)
    return { ok: false, error: "Invalid input" };
  const me = await requireUserId();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("settle_up", { p_group: groupId, p_other: otherId });
  if (error) return { ok: false, error: dbError(error.message) };
  const { data: prof } = await supabase.from("profiles").select("name").eq("id", me).single();
  after(() =>
    notifyUsers([otherId], {
      title: `${prof?.name ?? "Someone"} settled up with you`,
      body: `${data} item(s) marked paid`,
      url: "/",
    }),
  );
  refresh();
  return { ok: true, data: data as number };
}
