import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembers, requireUserId } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { EXPENSE_SELECT } from "@/lib/expense-view";
import { ExpenseForm } from "@/components/expense-form";
import type { ExpenseWithSplits } from "@/lib/types";

export const metadata: Metadata = { title: "Edit expense" };

export default async function EditExpensePage({ params }: PageProps<"/expenses/[id]/edit">) {
  const { id } = await params;
  const me = await requireUserId();
  const supabase = await createClient();
  const { data } = await supabase
    .from("expenses")
    .select(`${EXPENSE_SELECT}, expense_viewers(user_id)`)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const expense = data as unknown as ExpenseWithSplits;
  if (expense.created_by !== me || expense.deleted_at) redirect(`/expenses/${id}`);
  const members = await getMembers(expense.group_id);

  return <ExpenseForm me={me} groupId={expense.group_id} members={members} today={todayISO()} initial={expense} />;
}
