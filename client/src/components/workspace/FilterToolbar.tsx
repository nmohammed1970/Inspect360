import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FilterToolbarProps = {
  children: ReactNode;
  className?: string;
  /** Optional trailing actions (clear, count) */
  end?: ReactNode;
};

/**
 * Compact filter bar — search + selects without heavy “Filters” section chrome.
 */
export function FilterToolbar({ children, className, end }: FilterToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border/80 bg-card p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {children}
      </div>
      {end ? <div className="flex shrink-0 items-center gap-2 sm:ml-auto">{end}</div> : null}
    </div>
  );
}
