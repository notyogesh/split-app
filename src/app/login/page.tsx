import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-600 text-3xl font-extrabold text-white shadow-lg shadow-brand-600/30">
          ₹
        </div>
        <h1 className="text-2xl font-bold">Split</h1>
        <p className="mt-1 text-sm text-zinc-500">Shared expenses for your flat, without the awkward maths.</p>
      </div>
      <LoginForm next={next} initialError={error} googleEnabled={process.env.NEXT_PUBLIC_ENABLE_GOOGLE === "true"} />
    </main>
  );
}
