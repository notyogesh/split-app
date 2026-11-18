import Link from "next/link";
import { Lock, Repeat, Users } from "lucide-react";
import { category } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import { myPosition, nameOf } from "@/lib/expense-view";
import type { ExpenseWithSplits, Member } from "@/lib/types";

export function ExpenseRow({ e, me, members }: { e: ExpenseWithSplits; me: string; members: Member[] }) {
  const c = category(e.category);
  const pos = myPosition(e, me);
  return (
    <Link
      href={`/expenses/${e.id}`}
      className="flex items-center gap-3 px-4 py-3 active:bg-zinc-50 dark:active:bg-zinc-800/50"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-xl dark:bg-zinc-800">
        {c.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate font-medium">
          {e.title}
          {e.visibility === "private" && <Lock className="size-3 shrink-0 text-zinc-400" aria-label="Private" />}
          {e.visibility === "selected" && <Users className="size-3 shrink-0 text-zinc-400" aria-label="Selected people" />}
          {e.recurring_id && <Repeat className="size-3 shrink-0 text-zinc-400" aria-label="Recurring" />}
        </span>
        <span className="block truncate text-xs text-zinc-500">
          {e.visibility === "private" ? "Personal" : `${nameOf(members, e.paid_by, me)} paid ${formatMoney(e.amount_paise)}`} ·{" "}
          {shortDate(e.expense_date)}
        </span>
      </span>
      <span className="text-right text-sm">
        {pos.kind === "private" && <span className="font-semibold">{formatMoney(pos.paise)}</span>}
        {pos.kind === "lent" && (
          <>
            <span className={`block font-semibold ${pos.settled ? "text-zinc-400" : "text-emerald-600"}`}>
              {formatMoney(pos.paise)}
            </span>
            <span className="text-[11px] text-zinc-500">{pos.settled ? "all settled" : "you lent"}</span>
          </>
        )}
        {pos.kind === "owe" && (
          <>
            <span className={`block font-semibold ${pos.settled ? "text-zinc-400 line-through" : "text-orange-600"}`}>
              {formatMoney(pos.paise)}
            </span>
            <span className="text-[11px] text-zinc-500">{pos.settled ? "paid" : "you owe"}</span>
          </>
        )}
        {pos.kind === "none" && <span className="text-xs text-zinc-400">not involved</span>}
      </span>
    </Link>
  );
}
