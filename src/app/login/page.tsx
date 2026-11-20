import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  const error = typeof sp.error === "string" ? sp.error : null;
  const { data } = await (await createClient()).auth.getClaims();
  if (data?.claims?.sub) redirect(next);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <div className="glow mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl text-3xl font-extrabold">
          ₹
        </div>
        <h1 className="text-2xl font-bold">Split</h1>
        <p className="mt-1 text-sm text-zinc-500">Shared expenses for your flat, without the awkward maths.</p>
      </div>
      <LoginForm next={next} initialError={error} />
    </main>
  );
}
