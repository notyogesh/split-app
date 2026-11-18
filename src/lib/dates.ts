export const APP_TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";

/** YYYY-MM-DD for "now" in the app timezone. */
export function todayISO(tz = APP_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fromISO(s: string) {
  return new Date(s + "T00:00:00Z");
}

export function addDays(iso: string, days: number) {
  const d = fromISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

export type Period = "day" | "week" | "month" | "year";

/**
 * Inclusive start / exclusive end for the period containing `anchor`,
 * plus the anchors of the previous and next periods. Weeks start Monday.
 */
export function periodRange(period: Period, anchor: string) {
  const d = fromISO(anchor);
  let start: Date;
  let end: Date;
  if (period === "day") {
    start = d;
    end = fromISO(addDays(anchor, 1));
  } else if (period === "week") {
    const dow = (d.getUTCDay() + 6) % 7;
    start = fromISO(addDays(anchor, -dow));
    end = fromISO(addDays(toISO(start), 7));
  } else if (period === "month") {
    start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  } else {
    start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    end = new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1));
  }
  const prev =
    period === "day"
      ? addDays(anchor, -1)
      : period === "week"
        ? addDays(toISO(start), -7)
        : period === "month"
          ? toISO(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1)))
          : toISO(new Date(Date.UTC(start.getUTCFullYear() - 1, 0, 1)));
  return { start: toISO(start), end: toISO(end), prev, next: toISO(end) };
}

export function periodLabel(period: Period, start: string, end: string) {
  const s = fromISO(start);
  const opts = { timeZone: "UTC" } as const;
  if (period === "day")
    return s.toLocaleDateString("en-IN", { ...opts, weekday: "short", day: "numeric", month: "short" });
  if (period === "week") {
    const e = fromISO(addDays(end, -1));
    return `${s.toLocaleDateString("en-IN", { ...opts, day: "numeric", month: "short" })} – ${e.toLocaleDateString("en-IN", { ...opts, day: "numeric", month: "short" })}`;
  }
  if (period === "month") return s.toLocaleDateString("en-IN", { ...opts, month: "long", year: "numeric" });
  return String(s.getUTCFullYear());
}

export function shortDate(iso: string) {
  return fromISO(iso).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short" });
}

export function relativeTime(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts).toLocaleDateString("en-IN", { timeZone: APP_TZ, day: "numeric", month: "short", year: "numeric" });
}
