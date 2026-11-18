import type { Metadata } from "next";
import { getMembers, requireActiveGroup, requireUserId } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { ExpenseForm } from "@/components/expense-form";

export const metadata: Metadata = { title: "Add expense" };

export default async function NewExpensePage({ searchParams }: PageProps<"/expenses/new">) {
  const [me, group, sp] = await Promise.all([requireUserId(), requireActiveGroup(), searchParams]);
  const members = await getMembers(group.id);
  return (
    <ExpenseForm
      me={me}
      groupId={group.id}
      members={members}
      today={todayISO()}
      startRecurring={sp.recurring === "1"}
    />
  );
}
