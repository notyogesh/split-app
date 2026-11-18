"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Lock, Repeat, Users, UsersRound, X } from "lucide-react";
import { CATEGORIES, category as categoryOf } from "@/lib/categories";
import { formatMoney, paiseToInput, parseMoney, splitByWeights, splitEqually, type SplitRow } from "@/lib/money";
import { addDays } from "@/lib/dates";
import { createExpense, updateExpense } from "@/app/actions/expenses";
import { createRecurring } from "@/app/actions/recurring";
import type { ExpenseInput } from "@/lib/schemas";
import type { ExpenseWithSplits, Member, Visibility } from "@/lib/types";
import { Avatar } from "./avatar";
import { ReceiptPicker } from "./receipt-picker";

type Mode = "equal" | "exact" | "shares";

const LAST_CATEGORY_KEY = "split:lastCategory";

export function ExpenseForm({
  me,
  groupId,
  members,
  today,
  initial,
  startRecurring = false,
}: {
  me: string;
  groupId: string;
  members: Member[];
  today: string;
  initial?: ExpenseWithSplits;
  startRecurring?: boolean;
}) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState(initial ? paiseToInput(initial.amount_paise) : "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [cat, setCat] = useState(initial?.category ?? "other");
  const [date, setDate] = useState(initial?.expense_date ?? today);
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? me);
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "group");
  const [mode, setMode] = useState<Mode>(
    initial?.split_type === "exact" ? "exact" : initial?.split_type === "shares" ? "shares" : "equal",
  );
  const [participants, setParticipants] = useState<Set<string>>(
    () =>
      new Set(
        initial && initial.visibility !== "private"
          ? initial.expense_splits.filter((s) => s.share_paise > 0 || initial.split_type !== "exact").map((s) => s.user_id)
          : members.map((m) => m.id),
      ),
  );
  const [exact, setExact] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.expense_splits ?? []).map((s) => [s.user_id, paiseToInput(s.share_paise)])),
  );
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(members.map((m) => [m.id, Number(initial?.expense_splits.find((s) => s.user_id === m.id)?.shares ?? 1)])),
  );
  const [viewers, setViewers] = useState<Set<string>>(
    () => new Set((initial?.expense_viewers ?? []).map((v) => v.user_id)),
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [settled, setSettled] = useState(false);
  const [receiptPath, setReceiptPath] = useState<string | null>(initial?.receipt_path ?? null);
  const [uploading, setUploading] = useState(false);
  const [repeat, setRepeat] = useState(startRecurring);
  const [repeatDay, setRepeatDay] = useState(Math.min(Number(today.slice(8, 10)), 28));
  const [more, setMore] = useState(Boolean(initial?.note || initial?.receipt_path) || startRecurring);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) return;
    try {
      const last = localStorage.getItem(LAST_CATEGORY_KEY);
      // Restore the last-used category after hydration (localStorage isn't available on the server).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (last && CATEGORIES.some((c) => c.id === last)) setCat(last);
    } catch {}
  }, [editing]);

  const amountPaise = parseMoney(amount) ?? 0;
  const isPrivate = visibility === "private";
  const memberIds = members.map((m) => m.id);
  const others = members.filter((m) => m.id !== me);

  const splits: SplitRow[] = useMemo(() => {
    if (isPrivate || amountPaise <= 0) return [];
    const ids = memberIds.filter((id) => participants.has(id));
    if (mode === "equal") return splitEqually(amountPaise, ids, paidBy);
    if (mode === "shares")
      return splitByWeights(
        amountPaise,
        ids.map((id) => ({ user_id: id, weight: weights[id] ?? 1 })),
        paidBy,
      );
    return memberIds
      .map((id) => ({ user_id: id, share_paise: parseMoney(exact[id] ?? "") ?? 0 }))
      .filter((r) => r.share_paise > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrivate, amountPaise, participants, mode, weights, exact, paidBy, members]);

  const splitSum = splits.reduce((t, s) => t + s.share_paise, 0);
  const remaining = amountPaise - splitSum;
  const onlyPayer = splits.length === 1 && splits[0].user_id === paidBy;

  function toggle(set: Set<string>, id: string, update: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  }

  function buildPayload(): ExpenseInput | string {
    if (amountPaise <= 0) return "Enter an amount";
    if (uploading) return "Wait for the photo to finish uploading";
    const finalTitle = title.trim() || categoryOf(cat).label;
    if (!isPrivate) {
      if (splits.length === 0) return "Pick at least one person to split with";
      if (remaining !== 0)
        return remaining > 0 ? `${formatMoney(remaining)} still to assign` : `${formatMoney(-remaining)} over the total`;
    }
    return {
      group_id: groupId,
      title: finalTitle,
      category: cat,
      amount_paise: amountPaise,
      expense_date: date,
      paid_by: isPrivate ? me : paidBy,
      visibility,
      split_type: isPrivate || onlyPayer ? "none" : mode,
      splits: isPrivate ? [] : splits,
      viewers: visibility === "selected" ? [...viewers] : [],
      note: note.trim() || undefined,
      receipt_path: receiptPath,
      settled: settled || undefined,
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = buildPayload();
    if (typeof payload === "string") {
      setError(payload);
      if (payload === "Enter an amount") amountRef.current?.focus();
      return;
    }
    try {
      localStorage.setItem(LAST_CATEGORY_KEY, cat);
    } catch {}
    start(async () => {
      if (editing && initial) {
        const res = await updateExpense(initial.id, payload);
        if (!res.ok) return setError(res.error);
        router.replace(`/expenses/${initial.id}`);
        return;
      }
      const res = await createExpense(payload);
      if (!res.ok) return setError(res.error);
      if (repeat) {
        const rec = await createRecurring({ ...payload, receipt_path: null, settled: undefined }, repeatDay);
        if (!rec.ok) return setError(`Saved, but couldn't set up repeat: ${rec.error}`);
      }
      router.replace("/");
    });
  }

  const perHead =
    !isPrivate && mode === "equal" && splits.length > 1 && remaining === 0
      ? ` · ${formatMoney(Math.floor(amountPaise / splits.length))} each`
      : "";

  return (
    <form onSubmit={submit} className="flex min-h-dvh flex-col">
      <header className="pt-safe sticky top-0 z-20 flex items-center justify-between bg-zinc-50/90 px-4 py-3 backdrop-blur dark:bg-zinc-950/90">
        <Link href={editing ? `/expenses/${initial!.id}` : "/"} aria-label="Close" className="-ml-2 rounded-full p-2">
          <X className="size-5" />
        </Link>
        <h1 className="font-semibold">{editing ? "Edit expense" : "Add expense"}</h1>
        <span className="w-9" />
      </header>

      <div className="flex-1 space-y-5 px-4 pb-32">
        {/* Amount */}
        <div className="pt-2 text-center">
          {/* Label so tapping the ₹ also focuses the field; input width hugs the digits so ₹ sits right next to them. */}
          <label className="inline-flex cursor-text items-baseline justify-center gap-1">
            <span className={`text-3xl font-semibold ${amountPaise > 0 ? "text-brand-500" : "text-zinc-400"}`}>₹</span>
            <input
              ref={amountRef}
              aria-label="Amount"
              inputMode="decimal"
              autoFocus={!editing}
              placeholder="0"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                if (/^\d{0,8}(\.\d{0,2})?$/.test(v)) setAmount(v);
              }}
              style={{ width: `${Math.max(amount.length, 1) + 0.25}ch` }}
              className="max-w-[75vw] bg-transparent text-left text-5xl font-bold tabular-nums outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
            />
          </label>
          <input
            aria-label="What was it for?"
            className="mx-auto mt-2 block w-full max-w-xs rounded-xl bg-transparent px-3 py-2 text-center text-base outline-none placeholder:text-zinc-400 focus:bg-zinc-100 dark:focus:bg-zinc-900"
            placeholder={`What for? (${categoryOf(cat).label})`}
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Category */}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              aria-pressed={cat === c.id}
              className={cat === c.id ? "chip-on" : "chip-off"}
            >
              <span>{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>

        {/* Visibility */}
        <div>
          <span className="label">Who can see it</span>
          <div className="seg">
            <button type="button" aria-pressed={visibility === "group"} onClick={() => setVisibility("group")}>
              <UsersRound className="mr-1 inline size-4" /> Everyone
            </button>
            <button type="button" aria-pressed={visibility === "selected"} onClick={() => setVisibility("selected")}>
              <Users className="mr-1 inline size-4" /> Only involved
            </button>
            <button type="button" aria-pressed={visibility === "private"} onClick={() => setVisibility("private")}>
              <Lock className="mr-1 inline size-4" /> Just me
            </button>
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">
            {visibility === "group" && "Everyone in the group sees this."}
            {visibility === "selected" && "Only the payer, the people in the split, and anyone you add below."}
            {visibility === "private" && "Personal spending. Only you can see it; nothing is split."}
          </p>
        </div>

        {!isPrivate && (
          <>
            {/* Paid by */}
            <div>
              <span className="label">Paid by</span>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={paidBy === m.id}
                    onClick={() => setPaidBy(m.id)}
                    className={paidBy === m.id ? "chip-on" : "chip-off"}
                  >
                    {m.id === me ? "You" : m.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Split */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label mb-0">Split</span>
                {mode !== "exact" && members.length > 1 && (
                <button
                  type="button"
                  className="text-xs font-medium text-brand-600"
                  onClick={() =>
                    setParticipants(participants.size === members.length ? new Set([paidBy]) : new Set(memberIds))
                  }
                >
                  {participants.size === members.length ? "Only payer" : "Select all"}
                </button>
                )}
              </div>
              <div className="seg mb-3">
                {(["equal", "exact", "shares"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                    {m === "equal" ? "Equally" : m === "exact" ? "Exact ₹" : "Shares"}
                  </button>
                ))}
              </div>

              <ul className="card divide-y divide-zinc-100 dark:divide-zinc-800">
                {members.map((m) => {
                  const included = mode === "exact" ? (parseMoney(exact[m.id] ?? "") ?? 0) > 0 : participants.has(m.id);
                  const share = splits.find((s) => s.user_id === m.id)?.share_paise ?? 0;
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                      {mode === "exact" ? (
                        <span className="flex flex-1 items-center gap-3">
                          <Avatar id={m.id} name={m.name} />
                          <span className="flex-1 font-medium">{m.id === me ? "You" : m.name}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggle(participants, m.id, setParticipants)}
                          className="flex flex-1 items-center gap-3 text-left"
                          aria-pressed={included}
                        >
                          <span
                            className={`flex size-5 items-center justify-center rounded-md border-2 text-[11px] font-bold ${
                              included ? "border-brand-600 bg-brand-600 text-white" : "border-zinc-300 dark:border-zinc-600"
                            }`}
                          >
                            {included ? "✓" : ""}
                          </span>
                          <Avatar id={m.id} name={m.name} />
                          <span className="flex-1 font-medium">{m.id === me ? "You" : m.name}</span>
                        </button>
                      )}

                      {mode === "exact" && (
                        <span className="flex items-center gap-1">
                          <span className="text-zinc-400">₹</span>
                          <input
                            inputMode="decimal"
                            aria-label={`Amount for ${m.name}`}
                            className="w-24 rounded-lg bg-zinc-100 px-2 py-1.5 text-right outline-none focus:ring-2 focus:ring-brand-500 dark:bg-zinc-800"
                            placeholder="0"
                            value={exact[m.id] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^\d.]/g, "");
                              if (/^\d{0,8}(\.\d{0,2})?$/.test(v)) setExact({ ...exact, [m.id]: v });
                            }}
                          />
                        </span>
                      )}
                      {mode === "shares" && included && (
                        <span className="flex items-center gap-1">
                          <button
                            type="button"
                            className="btn-ghost size-8 p-0"
                            aria-label={`Fewer shares for ${m.name}`}
                            onClick={() => setWeights({ ...weights, [m.id]: Math.max(1, (weights[m.id] ?? 1) - 1) })}
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-semibold">{weights[m.id] ?? 1}</span>
                          <button
                            type="button"
                            className="btn-ghost size-8 p-0"
                            aria-label={`More shares for ${m.name}`}
                            onClick={() => setWeights({ ...weights, [m.id]: Math.min(20, (weights[m.id] ?? 1) + 1) })}
                          >
                            +
                          </button>
                        </span>
                      )}
                      {mode !== "exact" && (
                        <span className={`w-20 text-right text-sm ${included ? "" : "text-zinc-400"}`}>
                          {included && amountPaise > 0 ? formatMoney(share) : "—"}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {mode === "exact" && amountPaise > 0 && (
                <p className={`mt-2 text-right text-sm font-medium ${remaining === 0 ? "text-emerald-600" : "text-orange-600"}`}>
                  {remaining === 0
                    ? "✓ Adds up"
                    : remaining > 0
                      ? `${formatMoney(remaining)} left to assign`
                      : `${formatMoney(-remaining)} too much`}
                </p>
              )}
            </div>

            {visibility === "selected" && others.length > 0 && (
              <div>
                <span className="label">Also show to</span>
                <div className="flex flex-wrap gap-2">
                  {others
                    .filter((m) => m.id !== paidBy && !splits.some((s) => s.user_id === m.id))
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={viewers.has(m.id)}
                        onClick={() => toggle(viewers, m.id, setViewers)}
                        className={viewers.has(m.id) ? "chip-on" : "chip-off"}
                      >
                        {m.name}
                      </button>
                    ))}
                  {others.every((m) => m.id === paidBy || splits.some((s) => s.user_id === m.id)) && (
                    <p className="text-xs text-zinc-500">Everyone is already involved.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Date */}
        <div>
          <span className="label">When</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-pressed={date === today} onClick={() => setDate(today)} className={date === today ? "chip-on" : "chip-off"}>
              Today
            </button>
            <button
              type="button"
              aria-pressed={date === addDays(today, -1)}
              onClick={() => setDate(addDays(today, -1))}
              className={date === addDays(today, -1) ? "chip-on" : "chip-off"}
            >
              Yesterday
            </button>
            <input
              type="date"
              aria-label="Pick a date"
              value={date}
              max={addDays(today, 1)}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="min-w-0 flex-1 rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700"
            />
          </div>
        </div>

        {/* More options */}
        <button type="button" onClick={() => setMore(!more)} className="flex items-center gap-1 text-sm font-medium text-zinc-500">
          More options <ChevronDown className={`size-4 transition ${more ? "rotate-180" : ""}`} />
        </button>
        {more && (
          <div className="space-y-4">
            <ReceiptPicker me={me} path={receiptPath} onChange={setReceiptPath} onUploading={setUploading} />
            <div>
              <label className="label" htmlFor="note">
                Note
              </label>
              <textarea id="note" className="input min-h-20" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {!isPrivate && !editing && (
              <label className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <span>
                  <span className="block text-sm font-medium">Already settled</span>
                  <span className="text-xs text-zinc-500">Everyone has paid their share already</span>
                </span>
                <input type="checkbox" className="size-5 accent-brand-600" checked={settled} onChange={(e) => setSettled(e.target.checked)} />
              </label>
            )}
            {!editing && (
              <div className="rounded-xl bg-white p-3 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="flex items-center gap-1 text-sm font-medium">
                      <Repeat className="size-4" /> Repeat every month
                    </span>
                    <span className="text-xs text-zinc-500">Rent, wifi, maid… added automatically</span>
                  </span>
                  <input type="checkbox" className="size-5 accent-brand-600" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                </label>
                {repeat && (
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    On day
                    <select
                      value={repeatDay}
                      onChange={(e) => setRepeatDay(Number(e.target.value))}
                      className="rounded-lg bg-zinc-100 px-2 py-1 dark:bg-zinc-800"
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                    of each month
                  </label>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 px-4 pt-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto max-w-md">
          {error && <p className="mb-2 text-center text-sm font-medium text-red-600">{error}</p>}
          <button className="btn-primary w-full py-3.5 text-base" disabled={pending || uploading}>
            {pending ? "Saving…" : uploading ? "Uploading photo…" : `Save${amountPaise > 0 ? ` ${formatMoney(amountPaise)}` : ""}${perHead}`}
          </button>
        </div>
      </div>
    </form>
  );
}
