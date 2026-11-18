import { z } from "zod";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export const uuid = z.uuid();

export const payloadSchema = z.object({
  group_id: uuid,
  title: z.string().trim().min(1, "Add a title").max(80),
  category: z.string().max(24),
  amount_paise: z.number().int().positive("Enter an amount").max(100_000_000),
  expense_date: z.iso.date(),
  paid_by: uuid,
  visibility: z.enum(["private", "group", "selected"]),
  split_type: z.enum(["equal", "exact", "shares", "none"]),
  splits: z
    .array(
      z.object({
        user_id: uuid,
        share_paise: z.number().int().min(0),
        shares: z.number().positive().optional(),
      }),
    )
    .max(50),
  viewers: z.array(uuid).max(50),
  note: z.string().max(500).optional(),
  receipt_path: z
    .string()
    .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/)
    .nullable()
    .optional(),
  settled: z.boolean().optional(),
});

export type ExpenseInput = z.infer<typeof payloadSchema>;

export function firstIssue(err: z.ZodError) {
  return err.issues[0]?.message ?? "Invalid input";
}

export function dbError(message: string) {
  // Postgres "raise exception" text is written for users; hide anything else.
  if (/violates|syntax|permission denied|function/i.test(message)) return "Something went wrong. Try again.";
  return message;
}

