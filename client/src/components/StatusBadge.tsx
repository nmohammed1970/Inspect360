import { Badge, type BadgeProps } from "@/components/ui/badge";
import { StatusPill, type StatusPillTone } from "@/components/workspace/StatusPill";
import { cn } from "@/lib/utils";
import {
  toneClass,
  toneToBadgeVariant,
  type SemanticTone,
} from "@shared/statusPriorityStyles";

type StatusBadgeProps = {
  tone: SemanticTone;
  children: React.ReactNode;
  /** Soft outline pill (default) vs solid Badge variant */
  appearance?: "soft" | "solid" | "pill";
  className?: string;
  testId?: string;
} & Omit<BadgeProps, "variant" | "children">;

/**
 * Colored status/priority badge. Prefer this over raw Badge variants for workflow states.
 */
export function StatusBadge({
  tone,
  children,
  appearance = "soft",
  className,
  testId,
  ...rest
}: StatusBadgeProps) {
  if (appearance === "pill") {
    return (
      <StatusPill tone={tone as StatusPillTone} className={className} testId={testId}>
        {children}
      </StatusPill>
    );
  }

  if (appearance === "solid") {
    return (
      <Badge
        variant={toneToBadgeVariant(tone)}
        className={className}
        data-testid={testId}
        {...rest}
      >
        {children}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn("font-medium shadow-none", toneClass(tone), className)}
      data-testid={testId}
      {...rest}
    >
      {children}
    </Badge>
  );
}

/** ClassName helper for SelectTrigger / custom chrome that should match StatusPill. */
export function statusSelectClassName(tone: SemanticTone): string {
  return cn(
    "h-7 w-auto min-w-[7rem] gap-1 rounded-full border px-2.5 text-[11px] font-medium shadow-none [&>svg]:h-3 [&>svg]:w-3",
    toneClass(tone),
  );
}
