export type Visibility = "private" | "group" | "selected";

export type Profile = { id: string; name: string; upi_id: string | null };

export type Group = { id: string; name: string; invite_code: string; currency: string };

export type Member = Profile & { role: "admin" | "member" };

export type Split = {
  expense_id: string;
  user_id: string;
  share_paise: number;
  shares: number | null;
  status: "unpaid" | "paid";
  paid_at: string | null;
  marked_by: string | null;
};

export type Expense = {
  id: string;
  group_id: string;
  paid_by: string;
  created_by: string;
  title: string;
  category: string;
  amount_paise: number;
  expense_date: string;
  visibility: Visibility;
  split_type: "equal" | "exact" | "shares" | "none";
  note: string | null;
  receipt_path: string | null;
  recurring_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ExpenseWithSplits = Expense & {
  expense_splits: Split[];
  expense_viewers?: { user_id: string }[];
};

export type HistoryRow = {
  id: number;
  expense_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
};

/** Payload accepted by the create_expense / update_expense SQL functions. */
export type ExpensePayload = {
  group_id: string;
  title: string;
  category: string;
  amount_paise: number;
  expense_date: string;
  paid_by: string;
  visibility: Visibility;
  split_type: "equal" | "exact" | "shares" | "none";
  splits: { user_id: string; share_paise: number; shares?: number }[];
  viewers: string[];
  note?: string;
  receipt_path?: string | null;
  settled?: boolean;
};
