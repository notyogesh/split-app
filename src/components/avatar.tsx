const COLORS = [
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-indigo-500",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ id, name, size = "md" }: { id: string; name: string; size?: "sm" | "md" | "lg" }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const dims = size === "sm" ? "size-6 text-[10px]" : size === "lg" ? "size-11 text-base" : "size-8 text-xs";
  return (
    <span
      aria-hidden
      className={`${dims} ${COLORS[hash(id) % COLORS.length]} inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white`}
    >
      {initials}
    </span>
  );
}
