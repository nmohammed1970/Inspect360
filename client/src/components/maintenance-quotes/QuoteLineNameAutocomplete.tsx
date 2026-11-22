import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MaintenancePriceBookItem } from "@shared/schema";
import { formatMoneyMinor } from "./quoteMoney";

export type PriceBookPick = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  category: string;
  vatRate: string;
  unitPriceMinor: number;
};

interface QuoteLineNameAutocompleteProps {
  value: string;
  currency: string;
  disabled?: boolean;
  onNameChange: (name: string) => void;
  onPick: (item: PriceBookPick) => void;
  className?: string;
  testId?: string;
}

export const QuoteLineNameAutocomplete = ({
  value,
  currency,
  disabled,
  onNameChange,
  onPick,
  className,
  testId,
}: QuoteLineNameAutocompleteProps) => {
  const [open, setOpen] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(value.trim()), 250);
    return () => window.clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const { data: suggestions = [] } = useQuery<MaintenancePriceBookItem[]>({
    queryKey: ["/api/maintenance/price-book-items", currency, debouncedQ, "active"],
    queryFn: async () => {
      if (debouncedQ.length < 1) return [];
      const params = new URLSearchParams({
        q: debouncedQ,
        currency,
        active: "true",
      });
      const res = await fetch(`/api/maintenance/price-book-items?${params}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && debouncedQ.length >= 1 && !disabled,
    staleTime: 15_000,
  });

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <Input
        value={value}
        disabled={disabled}
        placeholder="Line name (type to search price book)"
        className={cn("h-9", className)}
        data-testid={testId}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onNameChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && !disabled && suggestions.length > 0 ? (
        <ul
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md"
          role="listbox"
        >
          {suggestions.slice(0, 12).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick({
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    unit: item.unit,
                    category: item.category,
                    vatRate: item.vatRate,
                    unitPriceMinor: item.defaultUnitPriceMinor,
                  });
                  setOpen(false);
                }}
              >
                <span className="font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.category}
                  {item.sku ? ` · ${item.sku}` : ""}
                  {" · "}
                  {formatMoneyMinor(item.defaultUnitPriceMinor, item.currency)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};
