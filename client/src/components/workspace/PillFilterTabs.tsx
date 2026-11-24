import { cn } from "@/lib/utils";

export type PillFilterTab = {
  id: string;
  label: string;
  count?: number;
};

type PillFilterTabsProps = {
  tabs: PillFilterTab[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  /** Optional test id prefix: `${prefix}-${tab.id}` */
  testIdPrefix?: string;
};

/** Solid-teal active pill filter row (template). */
export function PillFilterTabs({
  tabs,
  value,
  onChange,
  className,
  testIdPrefix = "pill-filter",
}: PillFilterTabsProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`${testIdPrefix}-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
            )}
          >
            <span>{tab.label}</span>
            {typeof tab.count === "number" ? (
              <span
                className={cn(
                  "tabular-nums",
                  active ? "text-primary-foreground/90" : "text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
