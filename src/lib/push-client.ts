"use client";

import { savePushSubscription, sendTestPush } from "@/app/actions/account";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Registers the service worker and returns this device's current subscription (or null). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return reg.pushManager.getSubscription();
}

/** Asks permission, subscribes this device, saves it, and sends a test notification. */
export async function enablePush(
  vapidKey: string,
): Promise<{ ok: true; sub: PushSubscription } | { ok: false; error: string }> {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted")
      return { ok: false, error: "Notifications are blocked. Allow them in your browser's site settings." };
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    const res = await savePushSubscription(JSON.parse(JSON.stringify(sub)));
    if (!res.ok) return { ok: false, error: res.error };
    await sendTestPush();
    return { ok: true, sub };
  } catch {
    return { ok: false, error: "Couldn't turn on notifications on this device." };
  }
}
