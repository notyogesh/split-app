/** All money is integer paise. ₹10.50 === 1050. */

const formatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatMoney(paise: number): string {
  return formatter.format(paise / 100);
}

/** "1,234.5" → 123450. Returns null for anything that isn't a positive amount. */
export function parseMoney(input: string): number | null {
  const clean = input.replace(/[,\s₹]/g, "");
  if (!/^\d{0,9}(\.\d{0,2})?$/.test(clean) || clean === "" || clean === ".") return null;
  const [whole, frac = ""] = clean.split(".");
  return Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
}

export function paiseToInput(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

export type SplitType = "equal" | "exact" | "shares" | "none";

export type SplitRow = { user_id: string; share_paise: number; shares?: number };

/**
 * Splits `amount` between `userIds`. Rounding leftovers (at most n-1 paise)
 * go to the payer when they're included, otherwise to the first person.
 */
export function splitByWeights(
  amount: number,
  weights: { user_id: string; weight: number }[],
  payerId: string,
): SplitRow[] {
  const active = weights.filter((w) => w.weight > 0);
  const total = active.reduce((s, w) => s + w.weight, 0);
  if (active.length === 0 || total <= 0) return [];
  const rows = active.map((w) => ({
    user_id: w.user_id,
    share_paise: Math.floor((amount * w.weight) / total),
    shares: w.weight,
  }));
  const leftover = amount - rows.reduce((s, r) => s + r.share_paise, 0);
  const target = rows.find((r) => r.user_id === payerId) ?? rows[0];
  target.share_paise += leftover;
  return rows;
}

export function splitEqually(amount: number, userIds: string[], payerId: string): SplitRow[] {
  return splitByWeights(
    amount,
    userIds.map((user_id) => ({ user_id, weight: 1 })),
    payerId,
  ).map(({ user_id, share_paise }) => ({ user_id, share_paise }));
}

/**
 * Turns a list of net balances (positive = is owed) into the fewest
 * "A pays B" transfers. Greedy largest-first; good enough for small groups.
 */
export function simplifyDebts(nets: { user_id: string; net_paise: number }[]) {
  const creditors = nets.filter((n) => n.net_paise > 0).map((n) => ({ ...n }));
  const debtors = nets.filter((n) => n.net_paise < 0).map((n) => ({ ...n, net_paise: -n.net_paise }));
  creditors.sort((a, b) => b.net_paise - a.net_paise);
  debtors.sort((a, b) => b.net_paise - a.net_paise);
  const transfers: { from: string; to: string; paise: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].net_paise, creditors[j].net_paise);
    if (amt > 0) transfers.push({ from: debtors[i].user_id, to: creditors[j].user_id, paise: amt });
    debtors[i].net_paise -= amt;
    creditors[j].net_paise -= amt;
    if (debtors[i].net_paise === 0) i++;
    if (creditors[j].net_paise === 0) j++;
  }
  return transfers;
}

/** upi://pay deep link that opens GPay / PhonePe / Paytm with the amount filled in. */
export function upiLink(upiId: string, name: string, paise: number, note: string) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: name,
    am: (paise / 100).toFixed(2),
    cu: "INR",
    tn: note.slice(0, 50),
  });
  return `upi://pay?${params.toString()}`;
}
