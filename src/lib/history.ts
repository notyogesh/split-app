import { category } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { nameOf } from "@/lib/expense-view";
import type { HistoryRow, Member } from "@/lib/types";

const VIS: Record<string, string> = { group: "everyone", selected: "only involved", private: "just me" };

/** Human sentences for one audit-log row, e.g. "changed amount ₹500 → ₹550". */
export function describeHistory(row: HistoryRow, members: Member[], me: string): string[] {
  const o = (row.old_data ?? {}) as Record<string, unknown>;
  const n = (row.new_data ?? {}) as Record<string, unknown>;
  const who = (id: unknown) => nameOf(members, id as string, me);
  const money = (v: unknown) => formatMoney(Number(v ?? 0));

  switch (row.action) {
    case "created":
      return [`added this · ${money(n.amount_paise)}`];
    case "deleted":
      return ["deleted this"];
    case "restored":
      return ["restored this"];
    case "marked_paid":
      return n.user_id === row.changed_by ? ["marked their share paid ✅"] : [`marked ${who(n.user_id)}'s share paid ✅`];
    case "marked_unpaid":
      return n.user_id === row.changed_by ? ["marked their share unpaid"] : [`marked ${who(n.user_id)}'s share unpaid`];
    case "split_added":
      return [`added ${who(n.user_id)} to the split (${money(n.share_paise)})`];
    case "split_removed":
      return [`removed ${who(o.user_id)} from the split`];
    case "split_changed":
      return [
        `changed ${who(n.user_id)}'s share ${money(o.share_paise)} → ${money(n.share_paise)}` +
          (o.status === "paid" && n.status === "unpaid" ? " (back to unpaid)" : ""),
      ];
    case "updated": {
      const out: string[] = [];
      if (o.amount_paise !== n.amount_paise) out.push(`changed amount ${money(o.amount_paise)} → ${money(n.amount_paise)}`);
      if (o.title !== n.title) out.push(`renamed "${o.title}" → "${n.title}"`);
      if (o.category !== n.category)
        out.push(`changed category ${category(String(o.category)).label} → ${category(String(n.category)).label}`);
      if (o.expense_date !== n.expense_date) out.push(`changed date ${o.expense_date} → ${n.expense_date}`);
      if (o.paid_by !== n.paid_by) out.push(`changed payer ${who(o.paid_by)} → ${who(n.paid_by)}`);
      if (o.visibility !== n.visibility)
        out.push(`changed visibility ${VIS[String(o.visibility)]} → ${VIS[String(n.visibility)]}`);
      if (o.split_type !== n.split_type) out.push(`changed split to ${n.split_type}`);
      if (o.note !== n.note) out.push(n.note ? "updated the note" : "removed the note");
      if (o.receipt_path !== n.receipt_path) out.push(n.receipt_path ? "attached a receipt" : "removed the receipt");
      return out.length ? out : ["edited this"];
    }
    default:
      return [row.action];
  }
}
