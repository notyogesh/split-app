"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({
  next,
  initialError,
  googleEnabled,
}: {
  next: string;
  initialError: string | null;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [error, setError] = useState(initialError);
  const [pending, start] = useTransition();

  const redirectTo = () => `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`;

  function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const { error } = await createClient().auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: redirectTo(), shouldCreateUser: true },
      });
      if (error) setError(error.message);
      else setStep("code");
    });
  }

  function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const { error } = await createClient().auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (error) {
        setError("That code didn't work. Check it, or request a new one.");
        return;
      }
      router.replace(next);
      router.refresh();
    });
  }

  function google() {
    start(async () => {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectTo() },
      });
      if (error) setError(error.message);
    });
  }

  return (
    <div className="card space-y-4 p-5">
      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-3">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            inputMode="email"
            className="input"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn-primary w-full py-3" disabled={pending}>
            {pending ? "Sending…" : "Email me a sign-in code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            We sent a code to <b>{email}</b>. Type it here, or tap the link in the email.
          </p>
          <input
            type="text"
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6,10}"
            maxLength={10}
            className="input text-center font-mono text-2xl tracking-[0.4em]"
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <button className="btn-primary w-full py-3" disabled={pending || code.length < 6}>
            {pending ? "Checking…" : "Sign in"}
          </button>
          <button type="button" className="w-full text-sm text-zinc-500" onClick={() => setStep("email")}>
            Use a different email
          </button>
        </form>
      )}

      {googleEnabled && step === "email" && (
        <>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" /> or <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <button type="button" className="btn-ghost w-full py-3" onClick={google} disabled={pending}>
            Continue with Google
          </button>
        </>
      )}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{error}</p>}
    </div>
  );
}
