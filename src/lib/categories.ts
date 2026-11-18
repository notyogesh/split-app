export const CATEGORIES = [
  { id: "groceries", label: "Groceries", emoji: "🛒" },
  { id: "food", label: "Food", emoji: "🍕" },
  { id: "rent", label: "Rent", emoji: "🏠" },
  { id: "electricity", label: "Electricity", emoji: "💡" },
  { id: "water", label: "Water", emoji: "🚰" },
  { id: "gas", label: "Gas", emoji: "🔥" },
  { id: "internet", label: "Wifi", emoji: "📶" },
  { id: "household", label: "Household", emoji: "🧽" },
  { id: "maid", label: "Help", emoji: "🧹" },
  { id: "transport", label: "Travel", emoji: "🛵" },
  { id: "fun", label: "Fun", emoji: "🎉" },
  { id: "other", label: "Other", emoji: "📦" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function category(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
