export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">Recent captures will appear here.</p>
      </div>

      <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Nothing captured yet. Capture, research, and conversation are coming in Phase 1–2.
      </div>
    </div>
  );
}
