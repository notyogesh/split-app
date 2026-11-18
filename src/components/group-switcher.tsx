"use client";

import { useTransition } from "react";
import { switchGroup } from "@/app/actions/account";
import type { Group } from "@/lib/types";

export function GroupSwitcher({ groups, activeId }: { groups: Group[]; activeId: string }) {
  const [pending, start] = useTransition();
  const active = groups.find((g) => g.id === activeId);
  if (groups.length <= 1) return <h1 className="text-xl font-bold">{active?.name}</h1>;
  return (
    <select
      aria-label="Switch group"
      value={activeId}
      disabled={pending}
      onChange={(e) => start(() => switchGroup(e.target.value))}
      className="-ml-1 appearance-none rounded-lg bg-transparent px-1 text-xl font-bold outline-none focus:ring-2 focus:ring-brand-500"
    >
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}
