import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type CardQuickAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
  testId?: string;
};

type CardQuickActionsProps = {
  actions: CardQuickAction[];
  className?: string;
};

/** Minimum bar width before labels fit without overlapping. */
function labelMinWidth(count: number): number {
  if (count <= 4) return 280;
  if (count === 5) return 340;
  if (count === 6) return 400;
  return 460;
}

/**
 * Equal-width icon action bar for property/block cards.
 * Shows Inventory / Inspect / etc. when wide enough; hides labels when cramped
 * and reveals the name on icon hover.
 */
export function CardQuickActions({ actions, className }: CardQuickActionsProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [showLabels, setShowLabels] = useState(true);

  useEffect(() => {
    const el = barRef.current;
    if (!el || actions.length === 0) return;

    const minWidth = labelMinWidth(actions.length);
    const update = () => {
      setShowLabels(el.clientWidth >= minWidth);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [actions.length]);

  if (actions.length === 0) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <div
        ref={barRef}
        className={cn("card-quick-actions", className)}
        data-count={actions.length}
        data-labels={showLabels ? "on" : "off"}
        role="toolbar"
        aria-label="Quick actions"
      >
        {actions.map((action) => {
          const Icon = action.icon;
          const content = (
            <>
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span
                className={cn(
                  "card-quick-action-label",
                  !showLabels && "card-quick-action-label--hidden",
                )}
              >
                {action.label}
              </span>
            </>
          );

          const control = action.href ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="card-quick-action"
              data-testid={action.testId}
            >
              <Link href={action.href} aria-label={action.label}>
                {content}
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="card-quick-action"
              data-testid={action.testId}
              aria-label={action.label}
              onClick={action.onClick}
            >
              {content}
            </Button>
          );

          if (!showLabels) {
            return (
              <Tooltip key={action.id}>
                <TooltipTrigger asChild>
                  <div className="min-w-0 w-full">{control}</div>
                </TooltipTrigger>
                <TooltipContent side="top" className="px-2 py-1 text-xs">
                  {action.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return <div key={action.id} className="min-w-0 w-full">{control}</div>;
        })}
      </div>
    </TooltipProvider>
  );
}
