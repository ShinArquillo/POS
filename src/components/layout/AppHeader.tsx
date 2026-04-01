import Image from "next/image";
import type { Profile } from "@/types/database";

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  staff: "Staff",
};

export function AppHeader({ profile }: { profile: Profile }) {
  return (
    <header className="z-20 border-b border-[rgba(15,68,21,0.06)] bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow-sm)] backdrop-blur-xl tablet:py-3.5">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3 tablet:gap-4">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-xl)] shadow-[var(--shadow-md)] tablet:h-14 tablet:w-14">
            <Image src="/logo.svg" alt="PHOEBE logo" fill sizes="56px" className="object-cover" priority />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--foreground-muted)] tablet:text-[11px]">
              PHOEBE
            </p>
            <p className="truncate text-lg font-bold leading-tight tracking-tight text-[var(--foreground)] tablet:text-xl">
              Drugstore
            </p>
          </div>
        </div>

        <div className="surface-glass max-w-[min(52%,18rem)] rounded-[var(--radius-xl)] border border-white/50 px-3 py-2 shadow-[var(--shadow-sm)] tablet:px-4 tablet:py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)] tablet:text-[10px]">
            Session
          </p>
          <p className="truncate text-sm font-semibold text-[var(--foreground)] tablet:text-base">
            {profile.full_name || profile.email}
          </p>
          <p className="mt-0.5 inline-flex rounded-full bg-[rgba(15,68,21,0.08)] px-2 py-0.5 text-[10px] font-semibold capitalize leading-none text-[var(--color-primary-bright)] tablet:text-xs">
            {roleLabels[profile.role] ?? profile.role}
          </p>
        </div>
      </div>
    </header>
  );
}
