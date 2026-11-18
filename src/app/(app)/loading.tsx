/** Shown instantly on every tap while the next page loads. */
export default function Loading() {
  return (
    <main className="pt-safe animate-pulse px-4 pt-4" aria-busy="true" aria-label="Loading">
      <div className="h-3 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-2 h-6 w-40 rounded-lg bg-zinc-200 dark:bg-zinc-800" />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="card h-20" />
        <div className="card h-20" />
        <div className="card col-span-2 h-16" />
      </div>

      <div className="mt-7 h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="card mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="size-10 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-2.5 w-1/3 rounded bg-zinc-100 dark:bg-zinc-800/70" />
            </div>
            <div className="h-3 w-12 rounded bg-zinc-200 dark:bg-zinc-800" />
          </div>
        ))}
      </div>
    </main>
  );
}
