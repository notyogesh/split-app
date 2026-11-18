import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveGroup, requireUserId } from "@/lib/data";
import { category } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { addDays, periodLabel, periodRange, todayISO, type Period } from "@/lib/dates";
import { EXPENSE_SELECT } from "@/lib/expense-view";
import type { ExpenseWithSplits } from "@/lib/types";

export const metadata: Metadata = { title: "Stats" };

const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

function mineIn(e: ExpenseWithSplits, me: string) {
  return e.expense_splits.find((s) => s.user_id === me)?.share_paise ?? 0;
}

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const [me, group, sp] = await Promise.all([requireUserId(), requireActiveGroup(), searchParams]);
  const period = PERIODS.find((p) => p.id === sp.p)?.id ?? "month";
  const today = todayISO();
  const anchor = typeof sp.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const range = periodRange(period, anchor);
  const prevRange = periodRange(period, range.prev);
  const supabase = await createClient();

  const fetchRange = (start: string, end: string) =>
    supabase
      .from("expenses")
      .select(EXPENSE_SELECT)
      .eq("group_id", group.id)
      .is("deleted_at", null)
      .gte("expense_date", start)
      .lt("expense_date", end)
      .order("expense_date")
      .limit(5000);

  const [{ data }, { data: prevData }] = await Promise.all([
    fetchRange(range.start, range.end),
    fetchRange(prevRange.start, prevRange.end),
  ]);
  const expenses = (data ?? []) as unknown as ExpenseWithSplits[];
  const prev = (prevData ?? []) as unknown as ExpenseWithSplits[];

  const myShare = expenses.reduce((t, e) => t + mineIn(e, me), 0);
  const prevShare = prev.reduce((t, e) => t + mineIn(e, me), 0);
  const iPaid = expenses.filter((e) => e.paid_by === me).reduce((t, e) => t + e.amount_paise, 0);
  const shared = expenses.filter((e) => e.visibility !== "private");
  const sharedTotal = shared.reduce((t, e) => t + e.amount_paise, 0);
  const personal = expenses.filter((e) => e.visibility === "private").reduce((t, e) => t + e.amount_paise, 0);
  const change = prevShare > 0 ? Math.round(((myShare - prevShare) / prevShare) * 100) : null;

  // My share by category
  const byCat = new Map<string, number>();
  for (const e of expenses) {
    const v = mineIn(e, me);
    if (v > 0) byCat.set(e.category, (byCat.get(e.category) ?? 0) + v);
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] ?? 1;

  // Trend buckets
  let buckets: { key: string; label: string; value: number }[] = [];
  if (period === "week" || period === "month") {
    for (let d = range.start; d < range.end; d = addDays(d, 1)) {
      buckets.push({
        key: d,
        label: period === "week" ? new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "narrow", timeZone: "UTC" }) : String(Number(d.slice(8))),
        value: 0,
      });
    }
    for (const e of expenses) {
      const b = buckets.find((x) => x.key === e.expense_date);
      if (b) b.value += mineIn(e, me);
    }
  } else if (period === "year") {
    buckets = Array.from({ length: 12 }, (_, i) => ({
      key: String(i + 1).padStart(2, "0"),
      label: new Date(Date.UTC(2000, i, 1)).toLocaleDateString("en-IN", { month: "narrow", timeZone: "UTC" }),
      value: 0,
    }));
    for (const e of expenses) buckets[Number(e.expense_date.slice(5, 7)) - 1].value += mineIn(e, me);
  }
  const maxBucket = Math.max(1, ...buckets.map((b) => b.value));

  const topItems = expenses
    .map((e) => ({ e, v: mineIn(e, me) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 8);

  const href = (p: Period, d?: string) => `/stats?p=${p}${d && d !== today ? `&d=${d}` : ""}`;

  return (
    <main className="pt-safe">
      <h1 className="px-4 pt-4 text-xl font-bold">Your spending</h1>

      <div className="px-4 pt-3">
        <div className="seg">
          {PERIODS.map((p) => (
            <Link key={p.id} href={href(p.id, anchor)} aria-pressed={period === p.id} className="flex-1 rounded-lg py-2 text-center text-sm font-medium text-zinc-600 aria-pressed:bg-white aria-pressed:text-zinc-900 aria-pressed:shadow-sm dark:text-zinc-400 dark:aria-pressed:bg-zinc-700 dark:aria-pressed:text-white">
              {p.label}
            </Link>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Link href={href(period, range.prev)} className="rounded-full p-2" aria-label="Previous">
            <ChevronLeft className="size-5" />
          </Link>
          <span className="font-semibold">{periodLabel(period, range.start, range.end)}</span>
          {range.next <= today ? (
            <Link href={href(period, range.next)} className="rounded-full p-2" aria-label="Next">
              <ChevronRight className="size-5" />
            </Link>
          ) : (
            <span className="w-9" />
          )}
        </div>
      </div>

      <section className="px-4 pt-2">
        <div className="card p-5 text-center">
          <p className="text-xs font-medium text-zinc-500">My share (what I actually spent)</p>
          <p className="mt-1 text-4xl font-bold tracking-tight">{formatMoney(myShare)}</p>
          {change !== null && (
            <p className={`mt-1 text-xs font-medium ${change > 0 ? "text-orange-600" : "text-emerald-600"}`}>
              {change > 0 ? "▲" : "▼"} {Math.abs(change)}% vs previous {period}
            </p>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <div className="card p-3">
            <p className="text-[11px] text-zinc-500">I paid</p>
            <p className="font-semibold">{formatMoney(iPaid)}</p>
          </div>
          <div className="card p-3">
            <p className="text-[11px] text-zinc-500">Personal</p>
            <p className="font-semibold">{formatMoney(personal)}</p>
          </div>
          <div className="card p-3">
            <p className="text-[11px] text-zinc-500">Flat shared</p>
            <p className="font-semibold">{formatMoney(sharedTotal)}</p>
          </div>
        </div>
      </section>

      {buckets.length > 0 && (
        <section className="px-4 pt-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">Trend</h2>
          <div className="card p-4">
            <div className="flex h-32 items-end gap-[2px]" role="img" aria-label="Spending per day">
              {buckets.map((b) => (
                <div key={b.key} className="flex h-full flex-1 flex-col justify-end" title={`${b.label}: ${formatMoney(b.value)}`}>
                  <div
                    className={`w-full rounded-t ${b.value > 0 ? "bg-brand-500" : "bg-zinc-100 dark:bg-zinc-800"}`}
                    style={{ height: `${Math.max(2, (b.value / maxBucket) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-[2px] text-center text-[9px] text-zinc-400">
              {buckets.map((b, i) => (
                <span key={b.key} className="flex-1">
                  {period === "month" ? (i % 5 === 0 ? b.label : "") : b.label}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="px-4 pt-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-500">By category</h2>
        <div className="card space-y-3 p-4">
          {cats.length === 0 && <p className="text-sm text-zinc-500">No spending in this period.</p>}
          {cats.map(([id, v]) => {
            const c = category(id);
            return (
              <div key={id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>
                    {c.emoji} {c.label}
                  </span>
                  <span className="font-medium">
                    {formatMoney(v)} <span className="text-xs text-zinc-400">{Math.round((v / myShare) * 100)}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(v / maxCat) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {topItems.length > 0 && (
        <section className="px-4 pt-6">
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">Biggest items</h2>
          <ul className="card divide-y divide-zinc-100 dark:divide-zinc-800">
            {topItems.map(({ e, v }) => (
              <li key={e.id}>
                <Link href={`/expenses/${e.id}`} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="truncate">
                    {category(e.category).emoji} {e.title}
                  </span>
                  <span className="font-medium">{formatMoney(v)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
