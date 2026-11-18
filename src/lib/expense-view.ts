import type { ExpenseWithSplits, Member } from "@/lib/types";

export type MyPosition =
  | { kind: "private"; paise: number }
  | { kind: "lent"; paise: number; settled: boolean }
  | { kind: "owe"; paise: number; settled: boolean }
  | { kind: "none" };

/** How an expense affects me: what I'm owed (lent) or owe, and whether it's settled. */
export function myPosition(e: ExpenseWithSplits, me: string): MyPosition {
  if (e.visibility === "private") return { kind: "private", paise: e.amount_paise };
  if (e.paid_by === me) {
    const others = e.expense_splits.filter((s) => s.user_id !== me);
    const unpaid = others.filter((s) => s.status === "unpaid").reduce((t, s) => t + s.share_paise, 0);
    const total = others.reduce((t, s) => t + s.share_paise, 0);
    if (total === 0) return { kind: "none" };
    return { kind: "lent", paise: unpaid || total, settled: unpaid === 0 };
  }
  const mine = e.expense_splits.find((s) => s.user_id === me);
  if (!mine || mine.share_paise === 0) return { kind: "none" };
  return { kind: "owe", paise: mine.share_paise, settled: mine.status === "paid" };
}

export const EXPENSE_SELECT =
  "id, group_id, paid_by, created_by, title, category, amount_paise, expense_date, visibility, split_type, note, receipt_path, recurring_id, created_at, updated_at, deleted_at, expense_splits(expense_id, user_id, share_paise, shares, status, paid_at, marked_by)";

export function nameOf(members: Pick<Member, "id" | "name">[], id: string | null | undefined, me?: string) {
  if (!id) return "Someone";
  if (me && id === me) return "You";
  return members.find((m) => m.id === id)?.name || "Former member";
}
