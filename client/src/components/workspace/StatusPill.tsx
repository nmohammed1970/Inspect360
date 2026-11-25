import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  SEMANTIC_TONE_CLASS,
  type SemanticTone,
} from "@shared/statusPriorityStyles";

export type StatusPillTone = SemanticTone | "default";

const toneClass: Record<StatusPillTone, string> = {
  default: "border-border bg-muted/60 text-foreground",
  ...SEMANTIC_TONE_CLASS,
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
        toneClass[tone] ?? toneClass.default,
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
