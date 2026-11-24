import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

export type MetricDotTone =
  | "success"
  | "warning"
  | "critical"
  | "info"
  | "primary"
  | "muted"
  | "action";

/** @deprecated Prefer MetricDotTone — same values */
export type MetricTone = MetricDotTone;

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

const toneStyles: Record<
  MetricDotTone,
  {
    border: string;
    value: string;
    iconWrap: string;
    icon: string;
  }
> = {
  muted: {
    border: "border-t-border",
    value: "text-foreground",
    iconWrap: "bg-muted",
    icon: "text-muted-foreground",
  },
  primary: {
    border: "border-t-primary",
    value: "text-primary",
    iconWrap: "bg-primary/10",
    icon: "text-primary",
  },
  info: {
    border: "border-t-[color:var(--brand-info)]",
    value: "text-[color:var(--brand-info)]",
    iconWrap: "bg-[color:var(--brand-info)]/10",
    icon: "text-[color:var(--brand-info)]",
  },
  warning: {
    border: "border-t-[color:var(--brand-warning)]",
    value: "text-[color:var(--brand-slate)]",
    iconWrap: "bg-[color:var(--brand-warning)]/15",
    icon: "text-[color:var(--brand-warning)]",
  },
  action: {
    border: "border-t-[color:var(--brand-warning)]",
    value: "text-[color:var(--brand-slate)]",
    iconWrap: "bg-[color:var(--brand-warning)]/15",
    icon: "text-[color:var(--brand-warning)]",
  },
  critical: {
    border: "border-t-[color:var(--brand-critical)]",
    value: "text-[color:var(--brand-critical)]",
    iconWrap: "bg-[color:var(--brand-critical)]/10",
    icon: "text-[color:var(--brand-critical)]",
  },
  success: {
    border: "border-t-[color:var(--brand-success)]",
    value: "text-[color:var(--brand-success)]",
    iconWrap: "bg-[color:var(--brand-success)]/10",
    icon: "text-[color:var(--brand-success)]",
  },
};

type MetricSummaryCardProps = {
  value: ReactNode;
  /** Small muted label at top (e.g. "Open") */
  label: string;
  /** Muted caption under the value (e.g. "Assigned") */
  subLabel?: ReactNode;
  /** Accent tone for top border, value colour, and icon chip */
  tone?: MetricDotTone;
  /** @deprecated Use `tone` */
  dot?: MetricDotTone;
  icon?: IconComponent;
  className?: string;
  onClick?: () => void;
  active?: boolean;
  testId?: string;
  valueTestId?: string;
};

/**
 * Shared KPI / summary card — matches Work Orders Summary strip:
 * top accent border, label, large toned value, icon chip, optional sub-label.
 */
export function MetricSummaryCard({
  value,
  label,
  subLabel,
  tone,
  dot,
  icon: Icon,
  className,
  onClick,
  active,
  testId,
  valueTestId,
}: MetricSummaryCardProps) {
  const resolvedTone: MetricDotTone = tone ?? dot ?? "muted";
  const styles = toneStyles[resolvedTone];
  const Comp = onClick ? "button" : "div";

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "relative flex min-w-0 flex-col rounded-lg border border-border/80 border-t-4 bg-card p-4 text-left shadow-sm transition-colors",
        styles.border,
        onClick && "cursor-pointer hover:bg-muted/30",
        active && "ring-1 ring-primary/25 bg-primary/[0.03]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-1 text-2xl font-bold tabular-nums tracking-tight md:text-[1.75rem]",
              styles.value,
            )}
            data-testid={valueTestId}
          >
            {value}
          </p>
        </div>
        {Icon ? (
          <div className={cn("rounded-lg p-2 shrink-0", styles.iconWrap)}>
            <Icon className={cn("h-4 w-4", styles.icon)} aria-hidden />
          </div>
        ) : null}
      </div>
      {subLabel != null && subLabel !== "" ? (
        <p className="mt-2 text-[11px] text-muted-foreground leading-snug">{subLabel}</p>
      ) : null}
    </Comp>
  );
}
