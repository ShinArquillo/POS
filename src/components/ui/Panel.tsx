import { cn } from "@/lib/cn";

export function Panel({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-2xl)] border border-white/80 bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)] tablet:p-6",
        className
      )}
    >
      {title ? (
        <h2 className="mb-4 text-base font-bold text-[var(--foreground)] tablet:text-lg">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}
