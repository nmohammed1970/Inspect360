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

  // Soft pills: avoid Badge `outline` — its `[border-color:var(--badge-outline)]`
  // fights tone border colors and makes every status look grey.
  const { onClick, title, id, style } = rest;
  return (
    <span
      id={id}
      title={title}
      style={style}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "whitespace-nowrap inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-none capitalize shadow-none",
        toneClass(tone),
        className,
      )}
    >
      {children}
    </span>
  );
}

/** ClassName helper for SelectTrigger / custom chrome that should match StatusPill. */
export function statusSelectClassName(tone: SemanticTone): string {
  return cn(
    "h-7 w-auto min-w-[7rem] gap-1 rounded-full border px-2.5 text-[11px] font-medium shadow-none [&>svg]:h-3 [&>svg]:w-3",
    toneClass(tone),
  );
}
