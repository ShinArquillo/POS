import type { Profile } from "@/types/database";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";

export function TabletShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))] tablet:pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <AppHeader profile={profile} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 tablet:px-4 tablet:py-6 landscape-tablet:px-8 landscape-tablet:py-8">
        <div className="animate-[fadeIn_0.35s_ease-out]">{children}</div>
      </main>
      <BottomNav role={profile.role} />
    </div>
  );
}
