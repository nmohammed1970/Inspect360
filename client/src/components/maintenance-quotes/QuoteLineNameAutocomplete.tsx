import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MaintenancePriceBookItem } from "@shared/schema";
import { formatMoneyMinor } from "./quoteMoney";

export type PriceBookPick = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
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
  placeholder?: string;
  testId?: string;
}

type MenuPosition = { top: number; left: number; width: number };

export const QuoteLineNameAutocomplete = ({
  value,
  currency,
  disabled,
  onNameChange,
  onPick,
  className,
  placeholder = "Search price book or type a custom item",
  testId,
}: QuoteLineNameAutocompleteProps) => {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(value.trim()), 250);
    return () => window.clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        const portal = document.getElementById(listId);
        if (portal?.contains(e.target as Node)) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [listId]);

  const updateMenuPos = () => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 280),
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
    const onReposition = () => updateMenuPos();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, value, suggestionsKey(debouncedQ, currency)]);

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

  const showMenu = open && !disabled && suggestions.length > 0 && menuPos;

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <Input
        ref={inputRef}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={cn("h-10 bg-muted/30", className)}
        data-testid={testId}
        autoComplete="off"
        onFocus={() => {
          setOpen(true);
          updateMenuPos();
        }}
        onChange={(e) => {
          onNameChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {showMenu
        ? createPortal(
            <ul
              id={listId}
              role="listbox"
              className="fixed z-[200] max-h-64 overflow-auto rounded-md border bg-popover p-1 text-sm shadow-lg"
              style={{
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
              }}
            >
              {suggestions.slice(0, 12).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 rounded-sm px-2.5 py-2 text-left hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onPick({
                        id: item.id,
                        name: item.name,
                        description: item.description,
                        sku: item.sku,
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
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
};

function suggestionsKey(q: string, currency: string) {
  return `${currency}:${q}`;
}
