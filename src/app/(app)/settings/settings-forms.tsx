"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Copy, RefreshCw, Share2 } from "lucide-react";
import {
  createGroup,
  removePushSubscription,
  resetInviteCode,
  savePushSubscription,
  saveProfile,
  sendTestPush,
} from "@/app/actions/account";

export function ProfileForm({ name, upi }: { name: string; upi: string }) {
  const [state, action, pending] = useActionState(saveProfile, null);
  return (
    <form action={action} className="card space-y-3 p-4">
      <div>
        <label className="label" htmlFor="name">
          Name
        </label>
        <input id="name" name="name" className="input" defaultValue={name} required maxLength={40} />
      </div>
      <div>
        <label className="label" htmlFor="upi_id">
          UPI ID <span className="normal-case">(so flatmates can pay you in one tap)</span>
        </label>
        <input id="upi_id" name="upi_id" className="input" defaultValue={upi} placeholder="name@okaxis" autoCapitalize="none" />
      </div>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-600">Saved ✓</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function InviteCard({
  groupId,
  code,
  site,
  canReset,
  groupName,
}: {
  groupId: string;
  code: string;
  site: string;
  canReset: boolean;
  groupName: string;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const path = `/join/${code}`;
  const fullLink = () => `${site || window.location.origin}${path}`;

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: `Join ${groupName} on Split`, url: fullLink() });
      else await copy();
    } catch {}
  }
  async function copy() {
    await navigator.clipboard.writeText(fullLink());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card p-4">
      <p className="text-sm font-medium">Invite someone</p>
      <p className="mt-1 truncate rounded-lg bg-zinc-100 px-3 py-2 font-mono text-xs dark:bg-zinc-800">{site}{path}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={share} className="btn-primary flex-1">
          <Share2 className="size-4" /> Share link
        </button>
        <button onClick={copy} className="btn-ghost">
          <Copy className="size-4" /> {copied ? "Copied" : "Copy"}
        </button>
        {canReset && (
          <button
            className="btn-ghost"
            aria-label="Reset invite link"
            disabled={pending}
            onClick={() => {
              if (!confirm("Make a new link? The old one will stop working.")) return;
              start(async () => {
                const res = await resetInviteCode(groupId);
                if (!res.ok) alert(res.error);
              });
            }}
          >
            <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Anyone with this link can join. Reset it if it gets shared too widely.</p>
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationToggle({ vapidKey }: { vapidKey: string }) {
  const [supported, setSupported] = useState(false);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        setSupported(true);
        return reg.pushManager.getSubscription();
      })
      .then(setSub)
      .catch(() => setSupported(false));
  }, [vapidKey]);

  if (!vapidKey) return null;
  if (!supported)
    return (
      <p className="card p-4 text-sm text-zinc-500">
        Notifications need the app on your home screen (iPhone) or a supported browser.
      </p>
    );

  function enable() {
    setMsg(null);
    start(async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return setMsg("Notifications are blocked in your browser settings.");
        const reg = await navigator.serviceWorker.ready;
        const s = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        const res = await savePushSubscription(JSON.parse(JSON.stringify(s)));
        if (!res.ok) return setMsg(res.error);
        setSub(s);
        await sendTestPush();
      } catch {
        setMsg("Couldn't turn on notifications on this device.");
      }
    });
  }

  function disable() {
    start(async () => {
      if (!sub) return;
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
      setSub(null);
    });
  }

  return (
    <div className="card flex items-center gap-3 p-4">
      {sub ? <Bell className="size-5 text-brand-600" /> : <BellOff className="size-5 text-zinc-500" />}
      <div className="flex-1">
        <p className="font-medium">Notifications</p>
        <p className="text-xs text-zinc-500">{msg ?? (sub ? "On for this device" : "Get notified when someone adds an expense")}</p>
      </div>
      <button onClick={sub ? disable : enable} disabled={pending} className={sub ? "btn-ghost" : "btn-primary"}>
        {pending ? "…" : sub ? "Turn off" : "Turn on"}
      </button>
    </div>
  );
}

export function NewGroupForm() {
  const [state, action, pending] = useActionState(createGroup, null);
  return (
    <form action={action} className="card flex gap-2 p-3">
      <input name="group" className="input py-2" placeholder="Group name" required maxLength={40} />
      <button className="btn-ghost shrink-0" disabled={pending}>
        Create
      </button>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
