"use client";

import { useTransition } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import { setRecurring } from "@/app/actions/recurring";

export function RecurringActions({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  const run = (a: boolean, remove = false) =>
    start(async () => {
      const res = await setRecurring(id, a, remove);
      if (!res.ok) alert(res.error);
    });
  return (
    <span className="flex gap-1">
      <button
        disabled={pending}
        onClick={() => run(!active)}
        className="rounded-full p-2 text-zinc-600 dark:text-zinc-300"
        aria-label={active ? "Pause" : "Resume"}
      >
        {active ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <button
        disabled={pending}
        onClick={() => confirm("Delete this recurring expense? Past expenses stay.") && run(active, true)}
        className="rounded-full p-2 text-red-600"
        aria-label="Delete"
      >
        <Trash2 className="size-4" />
      </button>
    </span>
  );
}
