"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { signUpWithInvite } from "@/app/actions/auth";

export function SignupForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState(signUpWithInvite, null);
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="card space-y-3 p-5">
      <input type="hidden" name="code" value={code} />
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" className="input" required maxLength={40} autoFocus autoComplete="given-name" placeholder="e.g. Ravi" />
      </div>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" inputMode="email" placeholder="you@example.com" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password <span className="normal-case">(8+ characters)</span>
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            className="input pr-11"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
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
      {state && !state.ok && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">{state.error}</p>
      )}
      <button className="btn-primary w-full py-3" disabled={pending}>
        {pending ? "Creating account…" : "Create account & join"}
      </button>
    </form>
  );
}
