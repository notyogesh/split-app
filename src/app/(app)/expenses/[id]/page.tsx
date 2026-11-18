import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Pencil, Repeat, Users, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembers, requireUserId } from "@/lib/data";
import { category } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { relativeTime, shortDate } from "@/lib/dates";
import { EXPENSE_SELECT, nameOf } from "@/lib/expense-view";
import { describeHistory } from "@/lib/history";
import type { ExpenseWithSplits, HistoryRow } from "@/lib/types";
import { Avatar } from "@/components/avatar";
import { SplitStatusButton, DeleteExpenseButton, ShareExpenseButton } from "./expense-actions";

export const metadata: Metadata = { title: "Expense" };

export default async function ExpensePage({ params }: PageProps<"/expenses/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireUserId();
  const supabase = await createClient();

  const [{ data }, { data: historyData }] = await Promise.all([
    supabase.from("expenses").select(`${EXPENSE_SELECT}, expense_viewers(user_id)`).eq("id", id).maybeSingle(),
    supabase.from("expense_history").select("*").eq("expense_id", id).order("changed_at", { ascending: false }),
  ]);
  if (!data) notFound();
  const e = data as unknown as ExpenseWithSplits;
  const history = (historyData ?? []) as HistoryRow[];
  const members = await getMembers(e.group_id);
  const c = category(e.category);
  const payer = members.find((m) => m.id === e.paid_by);
  const isCreator = e.created_by === me;
  const deleted = Boolean(e.deleted_at);

  const receiptUrl = e.receipt_path
    ? (await supabase.storage.from("receipts").createSignedUrl(e.receipt_path, 60 * 30)).data?.signedUrl
    : null;

  const splits = [...e.expense_splits].sort((a, b) =>
    a.user_id === e.paid_by ? -1 : b.user_id === e.paid_by ? 1 : 0,
  );
  const unpaidTotal = splits.filter((s) => s.status === "unpaid").reduce((t, s) => t + s.share_paise, 0);

  return (
    <main className="pt-safe">
      <header className="flex items-center justify-between px-2 py-2">
        <Link href="/" aria-label="Back" className="rounded-full p-2">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-1">
          {!deleted && (
            <ShareExpenseButton
              text={`${e.title}: ${formatMoney(e.amount_paise)} paid by ${payer?.name ?? "someone"} on ${shortDate(e.expense_date)}.\n${splits
                .map((s) => `• ${nameOf(members, s.user_id)}: ${formatMoney(s.share_paise)} ${s.status === "paid" ? "✅" : "⏳"}`)
                .join("\n")}`}
            />
          )}
          {isCreator && !deleted && (
            <Link href={`/expenses/${e.id}/edit`} className="rounded-full p-2" aria-label="Edit">
              <Pencil className="size-5" />
            </Link>
          )}
        </div>
      </header>

      {deleted && (
        <div className="mx-4 mb-3 flex items-center justify-between rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          This expense was deleted.
          {isCreator && <DeleteExpenseButton id={e.id} restore />}
        </div>
      )}

      <section className="px-4 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white text-3xl shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
          {c.emoji}
        </span>
        <h1 className="mt-3 text-lg font-semibold">{e.title}</h1>
        <p className={`text-4xl font-bold tracking-tight ${deleted ? "text-zinc-400 line-through" : ""}`}>
          {formatMoney(e.amount_paise)}
        </p>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-zinc-500">
          {e.visibility === "private" ? (
            <>
              <Lock className="size-3.5" /> Personal · only you
            </>
          ) : e.visibility === "selected" ? (
            <>
              <Users className="size-3.5" /> Only people involved
            </>
          ) : (
            <>
              <UsersRound className="size-3.5" /> Everyone in the group
            </>
          )}
          · {shortDate(e.expense_date)}
          {e.recurring_id && <Repeat className="size-3.5" aria-label="Recurring" />}
        </p>
      </section>

      {e.visibility !== "private" && (
        <section className="px-4 pt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-500">
              {nameOf(members, e.paid_by, me)} paid · {c.label}
            </h2>
            {unpaidTotal > 0 && <span className="text-xs text-orange-600">{formatMoney(unpaidTotal)} pending</span>}
          </div>
          <ul className="card divide-y divide-zinc-100 dark:divide-zinc-800">
            {splits.map((s) => {
              const name = nameOf(members, s.user_id, me);
              const isPayer = s.user_id === e.paid_by;
              const canToggle = !deleted && !isPayer && (me === s.user_id || me === e.paid_by);
              return (
                <li key={s.user_id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar id={s.user_id} name={members.find((m) => m.id === s.user_id)?.name ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {name}
                      {isPayer && <span className="ml-1.5 text-xs font-normal text-zinc-500">paid</span>}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {formatMoney(s.share_paise)}
                      {s.shares && e.split_type === "shares" ? ` · ${s.shares} share${Number(s.shares) > 1 ? "s" : ""}` : ""}
                    </p>
                  </div>
                  {isPayer ? (
                    <span className="text-xs text-zinc-400">—</span>
                  ) : (
                    <SplitStatusButton
                      expenseId={e.id}
                      userId={s.user_id}
                      paid={s.status === "paid"}
                      disabled={!canToggle}
                      upi={
                        me === s.user_id && s.status === "unpaid" && payer?.upi_id
                          ? { id: payer.upi_id, name: payer.name, paise: s.share_paise, note: e.title }
                          : null
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">
            The person who owes or the person who paid can mark a share paid.
          </p>
        </section>
      )}

      {(e.note || receiptUrl) && (
        <section className="space-y-3 px-4 pt-6">
          {e.note && <p className="card p-4 text-sm whitespace-pre-wrap">{e.note}</p>}
          {receiptUrl && (
            <a href={receiptUrl} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={receiptUrl} alt="Receipt" className="max-h-80 rounded-2xl ring-1 ring-zinc-200 dark:ring-zinc-800" />
            </a>
          )}
        </section>
      )}

      <section className="px-4 pt-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-500">History</h2>
        <ol className="card space-y-0 p-4">
          {history.map((h, i) => (
            <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
              {i < history.length - 1 && (
                <span className="absolute top-7 bottom-0 left-3 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
              )}
              <Avatar id={h.changed_by ?? "x"} name={members.find((m) => m.id === h.changed_by)?.name ?? "?"} size="sm" />
              <div className="min-w-0 flex-1 text-sm">
                {describeHistory(h, members, me).map((line, j) => (
                  <p key={j}>
                    {j === 0 && <b className="font-semibold">{nameOf(members, h.changed_by, me)} </b>}
                    {line}
                  </p>
                ))}
                <p className="text-xs text-zinc-500">{relativeTime(h.changed_at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {isCreator && !deleted && (
        <section className="px-4 pt-6">
          <DeleteExpenseButton id={e.id} />
        </section>
      )}
    </main>
  );
}
