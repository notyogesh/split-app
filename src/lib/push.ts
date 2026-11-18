import "server-only";
import { sendNotification, setVapidDetails } from "web-push";
import { createAdminClient } from "@/lib/supabase/server";
import { vapidPublicKey } from "@/lib/env";

export type PushMessage = { title: string; body: string; url: string; tag?: string };

let configured = false;
function configure() {
  const pub = vapidPublicKey();
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) {
    setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
    configured = true;
  }
  return true;
}

export function pushEnabled() {
  return Boolean(vapidPublicKey() && process.env.VAPID_PRIVATE_KEY);
}

/** Best effort: never throws. Removes subscriptions the browser has revoked. */
export async function notifyUsers(userIds: string[], message: PushMessage) {
  if (userIds.length === 0 || !configure()) return;
  const admin = createAdminClient();
  if (!admin) return;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(message),
          { TTL: 60 * 60 * 24 },
        );
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    }),
  );
}
