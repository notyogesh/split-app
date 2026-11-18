import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembers, requireActiveGroup, requireUserId } from "@/lib/data";
import { category } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import { nameOf } from "@/lib/expense-view";
import type { ExpensePayload } from "@/lib/types";
import { RecurringActions } from "./recurring-actions";

export const metadata: Metadata = { title: "Recurring" };

type Row = {
  id: string;
  payload: ExpensePayload;
  day_of_month: number;
  next_run: string;
  active: boolean;
};

export default async function RecurringPage() {
  const [me, group] = await Promise.all([requireUserId(), requireActiveGroup()]);
  const supabase = await createClient();
  const [{ data }, members] = await Promise.all([
    supabase
      .from("recurring_expenses")
      .select("id, payload, day_of_month, next_run, active")
      .eq("group_id", group.id)
      .order("day_of_month"),
    getMembers(group.id),
  ]);
  const rows = (data ?? []) as Row[];

  return (
    <main className="pt-safe">
      <header className="flex items-center gap-2 px-2 py-2">
        <Link href="/settings" aria-label="Back" className="rounded-full p-2">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="flex-1 text-lg font-semibold">Recurring expenses</h1>
        <Link href="/expenses/new?recurring=1" className="btn-primary mr-2 px-3 py-2 text-xs">
          <Plus className="size-4" /> New
        </Link>
      </header>
      <p className="px-4 pb-3 text-sm text-zinc-500">
        These are added automatically each month. Only the person who set one up can see or change it here.
      </p>
      <ul className="card mx-4 divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.length === 0 && <li className="p-4 text-sm text-zinc-500">None yet. Rent and wifi are good candidates.</li>}
        {rows.map((r) => (
          <li key={r.id} className={`flex items-center gap-3 px-4 py-3 ${r.active ? "" : "opacity-50"}`}>
            <span className="text-2xl">{category(r.payload.category).emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {r.payload.title} · {formatMoney(r.payload.amount_paise)}
              </p>
              <p className="text-xs text-zinc-500">
                Day {r.day_of_month} · {nameOf(members, r.payload.paid_by, me)} pay
                {r.payload.paid_by === me ? "" : "s"} ·{" "}
                {r.active ? `next ${shortDate(r.next_run)}` : "paused"}
              </p>
            </div>
            <RecurringActions id={r.id} active={r.active} />
          </li>
        ))}
      </ul>
    </main>
  );
}
