"use client";

import { useTransition } from "react";
import { settleUp } from "@/app/actions/expenses";
import { upiLink } from "@/lib/money";

export function BalanceActions({
  groupId,
  otherId,
  otherName,
  paise,
  iOwe,
  upiId,
}: {
  groupId: string;
  otherId: string;
  otherName: string;
  paise: number;
  iOwe: boolean;
  upiId: string | null;
}) {
  const [pending, start] = useTransition();

  function settle() {
    const msg = iOwe
      ? `Mark everything you owe ${otherName} as paid?`
      : `Confirm ${otherName} paid you back? This marks all their shares as paid.`;
    if (!confirm(msg)) return;
    start(async () => {
      const res = await settleUp(groupId, otherId);
      if (!res.ok) alert(res.error);
    });
  }

  return (
    <div className="flex shrink-0 gap-2">
      {iOwe && upiId && (
        <a href={upiLink(upiId, otherName, paise, "Flat expenses")} className="btn-primary px-3 py-2 text-xs">
          Pay UPI
        </a>
      )}
      <button onClick={settle} disabled={pending} className="btn-ghost px-3 py-2 text-xs">
        {pending ? "…" : "Settle"}
      </button>
    </div>
  );
}
