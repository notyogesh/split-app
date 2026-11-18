import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyGroups, getMyProfile } from "@/lib/data";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const [profile, groups, sp] = await Promise.all([getMyProfile(), getMyGroups(), searchParams]);
  if (profile.name && groups.length > 0) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-bold">Welcome 👋</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-500">
        {groups.length > 0 ? `You've joined ${groups[0].name}. What should your flatmates call you?` : "Two quick things and you're in."}
      </p>
      {sp.invalid && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          That invite link isn&apos;t valid any more. Ask for a fresh one.
        </p>
      )}
      <OnboardingForm defaultName={profile.name} hasGroup={groups.length > 0} />
    </main>
  );
}
