import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type NavCardProps = {
  label: string;
  icon?: LucideIcon;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
  variant?: "solid" | "outline";
};

export function NavCard({
  label,
  icon: Icon,
  active,
  href,
  onClick,
  className,
  variant = "solid",
}: NavCardProps) {
  const base =
    "group flex min-h-[52px] min-w-[52px] flex-col items-center justify-center gap-1 rounded-[var(--radius-xl)] px-3 py-2.5 text-center transition duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring-focus)] tablet:min-h-[58px] tablet:min-w-[64px] tablet:gap-1.5 tablet:px-4 tablet:py-3";

  const styles =
    variant === "solid"
      ? active
        ? "bg-[var(--color-primary-bright)] text-[var(--color-cream-deep)] shadow-[0_6px_20px_rgba(15,68,21,0.35)] ring-2 ring-white/25 ring-inset"
        : "border border-[rgba(15,68,21,0.08)] bg-[var(--color-surface-solid)] text-[var(--foreground)] shadow-[var(--shadow-sm)] hover:border-[rgba(15,68,21,0.14)] hover:shadow-[var(--shadow-md)] active:scale-[0.97]"
      : active
        ? "border-2 border-[var(--color-primary-bright)] bg-[var(--color-cream-deep)] text-[var(--foreground)] shadow-[var(--shadow-sm)]"
        : "border-2 border-[rgba(15,68,21,0.12)] bg-[var(--color-surface-solid)] text-[var(--foreground)] hover:border-[rgba(15,68,21,0.22)]";

  const inner = (
    <>
      {Icon ? (
        <Icon
          className={cn(
            "h-6 w-6 shrink-0 transition-transform duration-200 tablet:h-6 tablet:w-6",
            active && variant === "solid" && "text-[var(--color-cream-deep)]",
            !active && "opacity-90 group-hover:opacity-100"
          )}
          strokeWidth={1.65}
          aria-hidden
        />
      ) : null}
      <span className="text-[11px] font-semibold leading-tight tracking-wide tablet:text-xs">
        {label}
      </span>
    </>
  );

  const cls = cn(base, styles, className);

  if (href) {
    return (
      <Link href={href} prefetch className={cls} scroll={false} onClick={onClick}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
