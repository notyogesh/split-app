import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembers, getMyGroups, requireActiveGroup, requireUserId } from "@/lib/data";
import { EXPENSE_SELECT, nameOf } from "@/lib/expense-view";
import { formatMoney, simplifyDebts } from "@/lib/money";
import { periodRange, todayISO } from "@/lib/dates";
import type { ExpenseWithSplits } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { ExpenseRow } from "@/components/expense-row";
import { GroupSwitcher } from "@/components/group-switcher";
import { NotificationPrompt } from "@/components/notification-prompt";
import { vapidPublicKey } from "@/lib/env";
import { BalanceActions } from "./balance-actions";

export default async function HomePage() {
  const [me, group] = await Promise.all([requireUserId(), requireActiveGroup()]);
  const supabase = await createClient();
  const month = periodRange("month", todayISO());

  const [members, groups, mine, all, recent, monthSplits] = await Promise.all([
    getMembers(group.id),
    getMyGroups(),
    supabase.rpc("my_balances", { p_group: group.id }),
    supabase.rpc("group_balances", { p_group: group.id }),
    supabase
      .from("expenses")
      .select(EXPENSE_SELECT)
      .eq("group_id", group.id)
      .is("deleted_at", null)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("expense_splits")
      .select("share_paise, expenses!inner(group_id, expense_date, deleted_at)")
      .eq("user_id", me)
      .eq("expenses.group_id", group.id)
      .is("expenses.deleted_at", null)
      .gte("expenses.expense_date", month.start)
      .lt("expenses.expense_date", month.end),
  ]);

  const balances = ((mine.data ?? []) as { user_id: string; net_paise: number }[]).sort(
    (a, b) => a.net_paise - b.net_paise,
  );
  const owedToMe = balances.filter((b) => b.net_paise > 0).reduce((t, b) => t + b.net_paise, 0);
  const iOwe = -balances.filter((b) => b.net_paise < 0).reduce((t, b) => t + b.net_paise, 0);
  const transfers = simplifyDebts((all.data ?? []) as { user_id: string; net_paise: number }[]);
  const monthSpend = (monthSplits.data ?? []).reduce((t, s) => t + Number(s.share_paise), 0);
  const expenses = (recent.data ?? []) as unknown as ExpenseWithSplits[];
  const firstName = (members.find((m) => m.id === me)?.name ?? "").split(" ")[0];

  return (
    <main className="pt-safe">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <p className="text-xs text-zinc-500">Hi {firstName} 👋</p>
          <GroupSwitcher groups={groups} activeId={group.id} />
        </div>
        <div className="flex -space-x-2">
          {members.slice(0, 5).map((m) => (
            <Avatar key={m.id} id={m.id} name={m.name} size="sm" />
          ))}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 px-4 pt-2">
        <div className="card p-4">
          <p className="text-xs font-medium text-zinc-500">You are owed</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{formatMoney(owedToMe)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-zinc-500">You owe</p>
          <p className="mt-1 text-2xl font-bold text-orange-600">{formatMoney(iOwe)}</p>
        </div>
        <Link href="/stats" className="card col-span-2 flex items-center justify-between p-4">
          <span>
            <span className="block text-xs font-medium text-zinc-500">Your spending this month</span>
            <span className="text-lg font-semibold">{formatMoney(monthSpend)}</span>
          </span>
          <ChevronRight className="size-5 text-zinc-400" />
        </Link>
      </section>

      <section className="px-4 pt-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-500">Balances</h2>
        <div className="card divide-y divide-zinc-100 dark:divide-zinc-800">
          {balances.length === 0 && (
            <p className="p-4 text-sm text-zinc-500">All settled up. Nice! 🎉</p>
          )}
          {balances.map((b) => {
            const person = members.find((m) => m.id === b.user_id);
            const name = person?.name ?? "Former member";
            const theyOwe = b.net_paise > 0;
            return (
              <div key={b.user_id} className="flex items-center gap-3 p-4">
                <Avatar id={b.user_id} name={name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{name}</p>
                  <p className={`text-sm ${theyOwe ? "text-emerald-600" : "text-orange-600"}`}>
                    {theyOwe ? "owes you" : "you owe"} {formatMoney(Math.abs(b.net_paise))}
                  </p>
                </div>
                <BalanceActions
                  groupId={group.id}
                  otherId={b.user_id}
                  otherName={name}
                  paise={Math.abs(b.net_paise)}
                  iOwe={!theyOwe}
                  upiId={person?.upi_id ?? null}
                />
              </div>
            );
          })}
        </div>
        {transfers.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-zinc-500">Simplest way for the whole flat to settle</summary>
            <ul className="card mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
              {transfers.map((t, i) => (
                <li key={i} className="flex justify-between px-4 py-2.5">
                  <span>
                    {nameOf(members, t.from, me)} → {nameOf(members, t.to, me)}
                  </span>
                  <span className="font-medium">{formatMoney(t.paise)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="px-4 pt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-500">Recent</h2>
          <Link href="/activity" className="text-sm font-medium text-brand-600">
            See all
          </Link>
        </div>
        <div className="card divide-y divide-zinc-100 overflow-hidden dark:divide-zinc-800">
          {expenses.length === 0 && (
            <div className="p-6 text-center">
              <p className="text-sm text-zinc-500">No expenses yet.</p>
              <Link href="/expenses/new" className="btn-primary mt-3">
                Add the first one
              </Link>
            </div>
          )}
          {expenses.map((e) => (
            <ExpenseRow key={e.id} e={e} me={me} members={members} />
          ))}
        </div>
      </section>
      <NotificationPrompt vapidKey={vapidPublicKey()} />
    </main>
  );
}
