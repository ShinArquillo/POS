"use client";

export default function AppLoading() {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center">
      <div className="inline-flex items-center gap-3 rounded-xl border border-[rgba(15,68,21,0.12)] bg-white px-4 py-3 text-sm font-semibold text-[var(--foreground)] shadow-[var(--shadow-sm)]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[rgba(15,68,21,0.25)] border-t-[var(--color-primary-bright)]" />
        Loading...
      </div>
    </div>
  );
}
