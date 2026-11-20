"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, X } from "lucide-react";
import { currentSubscription, enablePush, pushSupported } from "@/lib/push-client";

// Per-device preference (this is a convenience, not app data).
const NEVER_KEY = "split:notif-never"; // localStorage: "1" = never ask again
const LATER_KEY = "split:notif-later"; // sessionStorage: "1" = asked to wait until next app open

function read(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {}
}

/**
 * Bottom-sheet asking to turn on notifications. Shown only when this device
 * supports push, isn't subscribed yet, hasn't blocked notifications, and the
 * user hasn't chosen "Never ask again" (or "Ask next time" during this visit).
 */
export function NotificationPrompt({ vapidKey }: { vapidKey: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!vapidKey || !pushSupported()) return;
    if (Notification.permission === "denied") return;
    if (read(() => localStorage, NEVER_KEY) === "1") return;
    if (read(() => sessionStorage, LATER_KEY) === "1") return;
    let cancelled = false;
    const t = setTimeout(() => {
      currentSubscription()
        .then((sub) => {
          if (!cancelled && !sub) setOpen(true);
        })
        .catch(() => {});
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [vapidKey]);

  if (!open) return null;

  function later() {
    write(() => sessionStorage, LATER_KEY, "1");
    setOpen(false);
  }
  function never() {
    write(() => localStorage, NEVER_KEY, "1");
    setOpen(false);
  }
  function turnOn() {
    setError(null);
    start(async () => {
      const res = await enablePush(vapidKey);
      if (res.ok) {
        setDone(true);
        setTimeout(() => setOpen(false), 1800);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={later}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-title"
        onClick={(e) => e.stopPropagation()}
        className="pb-safe w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between">
          <span className="glow flex size-12 items-center justify-center rounded-2xl">
            <Bell className="size-6" />
          </span>
          <button onClick={later} aria-label="Close" className="-mr-2 rounded-full p-2 text-zinc-500">
            <X className="size-5" />
          </button>
        </div>

        {done ? (
          <>
            <h2 id="notif-title" className="mt-4 text-lg font-bold">
              Notifications are on 🎉
            </h2>
            <p className="mt-1 text-sm text-zinc-500">You&apos;ll get a test notification in a moment.</p>
          </>
        ) : (
          <>
            <h2 id="notif-title" className="mt-4 text-lg font-bold">
              Turn on notifications?
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              <li>• When a flatmate adds an expense with your share</li>
              <li>• When someone marks a share paid or settles up</li>
              <li>• When an expense you&apos;re in is edited</li>
            </ul>
            <p className="mt-3 text-xs text-zinc-500">
              After tapping <b>Turn on</b>, choose <b>Allow</b> when your browser asks. You can change this any time in
              Settings.
            </p>

            {error && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p>}

            <div className="mt-5 space-y-2">
              <button onClick={turnOn} disabled={pending} className="btn-primary w-full py-3 text-base">
                {pending ? "Turning on…" : "Turn on"}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={later} disabled={pending} className="btn-ghost">
                  Ask next time
                </button>
                <button onClick={never} disabled={pending} className="btn-ghost text-zinc-500">
                  Never ask again
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
