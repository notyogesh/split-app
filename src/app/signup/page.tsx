import type { Metadata } from "next";
import Link from "next/link";
import { inviteGroupName } from "@/lib/invite";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Join" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code.toLowerCase() : "";
  const groupName = await inviteGroupName(code);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <div className="glow mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl text-3xl font-extrabold">
          ₹
        </div>
        {groupName ? (
          <>
            <h1 className="text-2xl font-bold">Join {groupName}</h1>
            <p className="mt-1 text-sm text-zinc-500">Create your account. You&apos;ll stay signed in on this device.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Invite needed</h1>
            <p className="mt-1 text-sm text-zinc-500">
              This invite link isn&apos;t valid. Ask a flatmate to send you the link from Settings.
            </p>
          </>
        )}
      </div>
      {groupName && <SignupForm code={code} />}
      <p className="mt-4 text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href={code ? `/login?next=${encodeURIComponent(`/join/${code}`)}` : "/login"} className="font-medium text-brand-600">
          Sign in
        </Link>
      </p>
    </main>
  );
}
