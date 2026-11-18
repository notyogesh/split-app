import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMembers, requireActiveGroup, requireUserId } from "@/lib/data";
import { EXPENSE_SELECT, myPosition } from "@/lib/expense-view";
import { ExpenseRow } from "@/components/expense-row";
import type { ExpenseWithSplits } from "@/lib/types";

export const metadata: Metadata = { title: "Activity" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unsettled" },
  { id: "paid-by-me", label: "I paid" },
  { id: "private", label: "Personal" },
  { id: "deleted", label: "Deleted" },
] as const;

const PAGE = 60;

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const [me, group, sp] = await Promise.all([requireUserId(), requireActiveGroup(), searchParams]);
  const filter = FILTERS.find((f) => f.id === sp.f)?.id ?? "all";
  const limit = Math.min(Number(sp.n) || PAGE, 600);
  const supabase = await createClient();

  let q = supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("group_id", group.id)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filter === "deleted") q = q.not("deleted_at", "is", null).eq("created_by", me);
  else q = q.is("deleted_at", null);
  if (filter === "paid-by-me") q = q.eq("paid_by", me).neq("visibility", "private");
  if (filter === "private") q = q.eq("visibility", "private");

  const [{ data }, members] = await Promise.all([q, getMembers(group.id)]);
  let rows = (data ?? []) as unknown as ExpenseWithSplits[];
  if (filter === "unpaid") {
    rows = rows.filter((e) => {
      const p = myPosition(e, me);
      return (p.kind === "owe" || p.kind === "lent") && !p.settled;
    });
  }

  // Group by month for scanning.
  const byMonth = new Map<string, ExpenseWithSplits[]>();
  for (const e of rows) {
    const key = e.expense_date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
  }

  return (
    <main className="pt-safe">
      <h1 className="px-4 pt-4 text-xl font-bold">Activity</h1>
      <nav className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={f.id === "all" ? "/activity" : `/activity?f=${f.id}`}
            className={filter === f.id ? "chip-on" : "chip-off"}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-zinc-500">Nothing here.</p>}

      {[...byMonth.entries()].map(([month, list]) => (
        <section key={month} className="px-4 pb-4">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            {new Date(month + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
          </h2>
          <div className="card divide-y divide-zinc-100 overflow-hidden dark:divide-zinc-800">
            {list.map((e) => (
              <ExpenseRow key={e.id} e={e} me={me} members={members} />
            ))}
          </div>
        </section>
      ))}

      {(data?.length ?? 0) >= limit && (
        <div className="px-4 pb-6 text-center">
          <Link href={`/activity?${new URLSearchParams({ ...(filter !== "all" && { f: filter }), n: String(limit + PAGE) })}`} className="btn-ghost">
            Load older
          </Link>
        </div>
      )}
    </main>
  );
}
