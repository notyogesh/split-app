"use client";

import { useActionState, useState } from "react";
import { completeOnboarding } from "@/app/actions/account";

export function OnboardingForm({ defaultName, hasGroup }: { defaultName: string; hasGroup: boolean }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [state, action, pending] = useActionState(completeOnboarding, null);

  return (
    <form action={action} className="card space-y-5 p-5">
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" className="input" required maxLength={40} autoFocus defaultValue={defaultName} placeholder="e.g. Yogesh" />
      </div>

      {hasGroup ? (
        <input type="hidden" name="mode" value="none" />
      ) : (
        <>
          <input type="hidden" name="mode" value={mode} />
          <div className="seg">
            <button type="button" aria-pressed={mode === "create"} onClick={() => setMode("create")}>
              Start a group
            </button>
            <button type="button" aria-pressed={mode === "join"} onClick={() => setMode("join")}>
              I have an invite
            </button>
          </div>
          {mode === "create" ? (
            <div>
              <label className="label" htmlFor="group">
                Group name
              </label>
              <input id="group" name="group" className="input" required maxLength={40} placeholder="e.g. Flat 302" />
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="code">
                Invite link or code
              </label>
              <input id="code" name="code" className="input font-mono" required placeholder="https://…/join/abc123def456" />
            </div>
          )}
        </>
      )}

      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>
        {pending ? "Setting up…" : "Continue"}
      </button>
    </form>
  );
}
