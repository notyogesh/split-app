"use client";

import { createContext, use, useMemo, type ReactNode } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Config = { url: string; publishableKey: string };

const SupabaseConfig = createContext<Config | null>(null);

/** Root layout passes the (public) Supabase URL + key down at runtime. */
export function SupabaseProvider({ url, publishableKey, children }: Config & { children: ReactNode }) {
  const value = useMemo(() => ({ url, publishableKey }), [url, publishableKey]);
  return <SupabaseConfig value={value}>{children}</SupabaseConfig>;
}

/** Browser Supabase client (a singleton inside @supabase/ssr). */
export function useSupabase() {
  const cfg = use(SupabaseConfig);
  if (!cfg) throw new Error("useSupabase must be used inside <SupabaseProvider>");
  return useMemo(() => createBrowserClient(cfg.url, cfg.publishableKey), [cfg]);
}
