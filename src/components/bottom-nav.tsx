"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Home, ListOrdered, Plus, Settings } from "lucide-react";

const items = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/activity", label: "Activity", Icon: ListOrdered },
  { href: "/expenses/new", label: "Add", Icon: Plus, primary: true },
  { href: "/stats", label: "Stats", Icon: BarChart3 },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/expenses/new") || path.endsWith("/edit")) return null;
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <ul className="mx-auto flex max-w-md items-end justify-around px-2 pt-1.5">
        {items.map(({ href, label, Icon, ...rest }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          if ("primary" in rest) {
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label="Add expense"
                  className="-mt-6 flex size-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 active:scale-95"
                >
                  <Icon className="size-7" strokeWidth={2.5} />
                </Link>
              </li>
            );
          }
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex w-16 flex-col items-center gap-0.5 py-1 text-[11px] font-medium ${
                  active ? "text-brand-600" : "text-zinc-500"
                }`}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
