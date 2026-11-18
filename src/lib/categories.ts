/** Quick-pick categories shown as chips. "Other" lets you type your own (e.g. "Milk", "Rent"). */
export const CATEGORIES = [
  { id: "breakfast", label: "Breakfast", emoji: "🍳" },
  { id: "lunch", label: "Lunch", emoji: "🍱" },
  { id: "snacks", label: "Eve snacks", emoji: "☕" },
  { id: "dinner", label: "Dinner", emoji: "🍽️" },
  { id: "other", label: "Other", emoji: "📝" },
] as const;

/** Older built-in ids, kept so expenses saved before the change still show nicely. */
const LEGACY: Record<string, { label: string; emoji: string }> = {
  groceries: { label: "Groceries", emoji: "🛒" },
  food: { label: "Food", emoji: "🍕" },
  rent: { label: "Rent", emoji: "🏠" },
  electricity: { label: "Electricity", emoji: "💡" },
  water: { label: "Water", emoji: "🚰" },
  gas: { label: "Gas", emoji: "🔥" },
  internet: { label: "Wifi", emoji: "📶" },
  household: { label: "Household", emoji: "🧽" },
  maid: { label: "Help", emoji: "🧹" },
  transport: { label: "Travel", emoji: "🛵" },
  fun: { label: "Fun", emoji: "🎉" },
};

export const CUSTOM_MAX = 24;

export function isPreset(id: string) {
  return CATEGORIES.some((c) => c.id === id);
}

/** Label + emoji for any stored category: a preset, a legacy id, or custom text. */
export function category(id: string): { id: string; label: string; emoji: string } {
  const preset = CATEGORIES.find((c) => c.id === id);
  if (preset) return preset;
  const legacy = LEGACY[id];
  if (legacy) return { id, ...legacy };
  const text = id.trim();
  return { id, label: text || "Other", emoji: "📝" };
}

/** Meal that fits the time right now, so most adds need no category tap. */
export function mealForHour(hour: number): string {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 19) return "snacks";
  return "dinner";
}
