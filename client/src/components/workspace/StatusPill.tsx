import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusPillTone =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "critical"
  | "info"
  | "muted"
  | "urgent"
  | "action";

const toneClass: Record<StatusPillTone, string> = {
  default: "border-border bg-muted/60 text-foreground",
  primary: "border-primary/25 bg-primary/10 text-primary",
  success:
    "border-[color:var(--brand-success)]/30 bg-[color:var(--brand-success)]/10 text-[color:var(--brand-success)]",
  warning:
    "border-[color:var(--brand-warning)]/40 bg-[color:var(--brand-warning)]/15 text-[color:var(--brand-slate)]",
  critical:
    "border-[color:var(--brand-critical)]/30 bg-[color:var(--brand-critical)]/10 text-[color:var(--brand-critical)]",
  info: "border-[color:var(--brand-info)]/30 bg-[color:var(--brand-info)]/10 text-[color:var(--brand-info)]",
  muted: "border-border bg-muted text-muted-foreground",
  urgent:
    "border-[color:var(--brand-critical)]/30 bg-[color:var(--brand-critical)]/10 text-[color:var(--brand-critical)]",
  action:
    "border-[color:var(--brand-warning)]/40 bg-[color:var(--brand-warning)]/15 text-[color:var(--brand-slate)]",
};

type StatusPillProps = {
  children: ReactNode;
  tone?: StatusPillTone;
  className?: string;
  icon?: ReactNode;
  testId?: string;
};

/** Rounded status/priority pill using brand semantic tokens. */
export function StatusPill({
  children,
  tone = "default",
  className,
  icon,
  testId,
}: StatusPillProps) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-none",
        toneClass[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
