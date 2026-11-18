import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Repeat } from "lucide-react";
import { getMembers, getMyProfile, requireActiveGroup, requireUserId } from "@/lib/data";
import { Avatar } from "@/components/avatar";
import { signOut } from "@/app/actions/account";
import { InviteCard, NewGroupForm, NotificationToggle, ProfileForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [me, profile, group] = await Promise.all([requireUserId(), getMyProfile(), requireActiveGroup()]);
  const members = await getMembers(group.id);
  const isAdmin = members.find((m) => m.id === me)?.role === "admin";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <main className="pt-safe space-y-6 px-4 pt-4">
      <h1 className="text-xl font-bold">Settings</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-500">You</h2>
        <ProfileForm name={profile.name} upi={profile.upi_id ?? ""} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-500">{group.name}</h2>
        <ul className="card divide-y divide-zinc-100 dark:divide-zinc-800">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar id={m.id} name={m.name} />
              <span className="flex-1 font-medium">
                {m.name || "New member"} {m.id === me && <span className="text-xs text-zinc-500">(you)</span>}
              </span>
              {m.role === "admin" && <span className="text-xs text-zinc-500">admin</span>}
              {m.upi_id && <span className="text-xs text-emerald-600">UPI ✓</span>}
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <InviteCard groupId={group.id} code={group.invite_code} site={site} canReset={isAdmin} groupName={group.name} />
        </div>
      </section>

      <section className="space-y-3">
        <Link href="/recurring" className="card flex items-center gap-3 p-4">
          <Repeat className="size-5 text-zinc-500" />
          <span className="flex-1 font-medium">Recurring expenses</span>
          <ChevronRight className="size-5 text-zinc-400" />
        </Link>
        <NotificationToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-500">Another group (trip, office…)</h2>
        <NewGroupForm />
      </section>

      <section className="pb-6">
        <form action={signOut}>
          <button className="btn-ghost w-full">Sign out</button>
        </form>
        <p className="mt-4 text-center text-xs text-zinc-400">
          Tip: in your browser menu, choose “Add to Home screen” to use Split like an app.
        </p>
      </section>
    </main>
  );
}
