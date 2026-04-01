"use client";

import { usePathname } from "next/navigation";
import {
  MoreHorizontal,
  Package,
  Receipt,
  RotateCcw,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
} from "lucide-react";
import { useState } from "react";
import { signOutAction } from "@/app/actions/auth";
import type { Role } from "@/types/database";
import { NavCard } from "@/components/ui/NavCard";
import { cn } from "@/lib/cn";

function SignOutCard() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="flex w-full min-h-[52px] items-center justify-center rounded-[var(--radius-xl)] border border-[rgba(15,68,21,0.12)] bg-[var(--color-surface-solid)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--color-cream-deep)] hover:shadow-[var(--shadow-md)]"
      >
        Sign out
      </button>
    </form>
  );
}

export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const showOps = role === "admin" || role === "manager";

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] print:hidden tablet:px-6">
        <nav
          className="pointer-events-auto shadow-dock max-w-2xl rounded-[1.35rem] border border-white/60 bg-[var(--color-surface)] px-2 py-2 backdrop-blur-sm tablet:max-w-3xl tablet:rounded-3xl tablet:px-3 tablet:py-2.5"
          aria-label="Main"
        >
          <div className="flex items-end justify-center gap-1 tablet:gap-2">
            <NavCard
              href="/pos"
              label="POS"
              icon={ShoppingCart}
              active={pathname === "/pos"}
            />
            {showOps ? (
              <NavCard
                href="/inventory"
                label="Stock"
                icon={Package}
                active={pathname === "/inventory"}
              />
            ) : null}
            {showOps ? (
              <NavCard
                href="/restock"
                label="Orders"
                icon={Truck}
                active={pathname === "/restock"}
              />
            ) : null}
            <NavCard
              href="/sales"
              label="Sales"
              icon={Receipt}
              active={pathname === "/sales"}
            />
            <NavCard
              label="More"
              icon={MoreHorizontal}
              active={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
            />
          </div>
        </nav>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 z-20 mx-auto max-w-md px-4 transition duration-200 tablet:max-w-lg",
          "print:hidden",
          "bottom-[calc(5.25rem+env(safe-area-inset-bottom))] tablet:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]",
          moreOpen ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        )}
        aria-hidden={!moreOpen}
      >
        <div className="space-y-2 rounded-3xl border border-white/70 bg-[var(--color-surface)] p-3 shadow-[var(--shadow-lg)] backdrop-blur-sm tablet:p-4">
          <NavCard
            href="/account"
            label="My profile"
            icon={UserCog}
            variant="outline"
            active={pathname === "/account"}
            className="w-full !min-h-[56px] !flex-row justify-start gap-4"
            onClick={() => setMoreOpen(false)}
          />
          {showOps ? (
            <NavCard
              href="/returns"
              label="Returns"
              icon={RotateCcw}
              variant="outline"
              active={pathname === "/returns"}
              className="w-full !min-h-[56px] !flex-row justify-start gap-4"
              onClick={() => setMoreOpen(false)}
            />
          ) : null}
          {role === "admin" ? (
            <NavCard
              href="/team"
              label="Team & roles"
              icon={Users}
              variant="outline"
              active={pathname === "/team"}
              className="w-full !min-h-[56px] !flex-row justify-start gap-4"
              onClick={() => setMoreOpen(false)}
            />
          ) : null}
          <SignOutCard />
        </div>
      </div>

      {moreOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-10 bg-[rgba(10,47,15,0.12)] print:hidden"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
        />
      ) : null}
    </>
  );
}
