"use client";

import { useActionState, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { signIn } from "@/app/actions/auth";
import { useSupabase } from "@/lib/supabase/client";

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [state, action, pending] = useActionState(signIn, null);
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  const error = state && !state.ok ? state.error : initialError;

  return (
    <div className="card space-y-4 p-5">
      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            inputMode="email"
            className="input"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={show ? "text" : "password"}
              required
              autoComplete="current-password"
              className="input pr-11"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 px-3 text-zinc-500"
            >
              {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
        </div>
        <button className="btn-primary w-full py-3" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p>}

      <div className="space-y-1 text-center text-sm text-zinc-500">
        <p>New here? Open the invite link a flatmate sent you.</p>
        {!forgot ? (
          <button type="button" className="font-medium text-brand-600" onClick={() => setForgot(true)}>
            Forgot password?
          </button>
        ) : (
          <ForgotPassword />
        )}
      </div>
    </div>
  );
}

/** Rare fallback: a one-time email link (rate-limited by Supabase), then set a new password in Settings. */
function ForgotPassword() {
  const supabase = useSupabase();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-zinc-100 p-3 text-left dark:bg-zinc-800/60">
      <p>
        Easiest: ask your group admin to reset it from <b>Settings</b>. Or get a one-time sign-in link by email, then set
        a new password in Settings:
      </p>
      <input
        type="email"
        className="input bg-white dark:bg-zinc-900"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        type="button"
        className="btn-ghost w-full"
        disabled={pending || !email}
        onClick={() =>
          start(async () => {
            const { error } = await supabase.auth.signInWithOtp({
              email: email.trim().toLowerCase(),
              options: {
                shouldCreateUser: false,
                emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/settings")}`,
              },
            });
            setMsg(
              error
                ? error.status === 429
                  ? "Too many emails sent. Try again in an hour, or ask your admin."
                  : "Couldn't send the email."
                : "Check your email and open the link in this same browser.",
            );
          })
        }
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {msg && <p className="text-xs">{msg}</p>}
    </div>
  );
}
