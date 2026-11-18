"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Share2 } from "lucide-react";
import { deleteExpense, setSplitStatus } from "@/app/actions/expenses";
import { upiLink } from "@/lib/money";

export function SplitStatusButton({
  expenseId,
  userId,
  paid,
  disabled,
  upi,
}: {
  expenseId: string;
  userId: string;
  paid: boolean;
  disabled: boolean;
  upi: { id: string; name: string; paise: number; note: string } | null;
}) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState(paid);

  function toggle() {
    const next = !optimistic;
    setOptimistic(next);
    start(async () => {
      const res = await setSplitStatus(expenseId, userId, next);
      if (!res.ok) {
        setOptimistic(!next);
        alert(res.error);
      }
    });
  }

  return (
    <span className="flex items-center gap-2">
      {upi && !optimistic && (
        <a href={upiLink(upi.id, upi.name, upi.paise, upi.note)} className="btn-ghost px-2.5 py-1.5 text-xs">
          UPI
        </a>
      )}
      <button
        onClick={toggle}
        disabled={disabled || pending}
        aria-pressed={optimistic}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-default ${
          optimistic
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            : "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300"
        } ${disabled ? "" : "ring-1 ring-current/20 active:scale-95"}`}
      >
        {optimistic ? (
          <>
            <Check className="size-3.5" /> Paid
          </>
        ) : (
          "Unpaid"
        )}
      </button>
    </span>
  );
}

export function DeleteExpenseButton({ id, restore = false }: { id: string; restore?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className={restore ? "btn-ghost px-3 py-1.5 text-xs" : "btn-danger w-full"}
      onClick={() => {
        if (!restore && !confirm("Delete this expense? You can restore it later from Activity → Deleted.")) return;
        start(async () => {
          const res = await deleteExpense(id, restore);
          if (!res.ok) alert(res.error);
          else if (!restore) router.replace("/");
        });
      }}
    >
      {pending ? "…" : restore ? "Restore" : "Delete expense"}
    </button>
  );
}

export function ShareExpenseButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label="Share"
      className="rounded-full p-2"
      onClick={async () => {
        try {
          if (navigator.share) await navigator.share({ text });
          else {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        } catch {}
      }}
    >
      {copied ? <Check className="size-5 text-emerald-600" /> : <Share2 className="size-5" />}
    </button>
  );
}
