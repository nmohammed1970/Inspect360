import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MAINTENANCE_PRICE_BOOK_CATEGORIES,
  MAINTENANCE_PRICE_BOOK_CATEGORY_LABELS,
  MAINTENANCE_PRICE_BOOK_UNITS,
  MAINTENANCE_PRICE_BOOK_UNIT_LABELS,
  MAINTENANCE_PRICE_BOOK_VAT_LABELS,
  MAINTENANCE_PRICE_BOOK_VAT_RATES,
  type MaintenancePriceBookCategory,
  type MaintenancePriceBookUnit,
  type MaintenancePriceBookVatRate,
} from "@shared/maintenancePriceBookConstants";
import { computeQuoteLine, computeQuoteTotals } from "@shared/maintenanceFinanceMath";
import { Copy, Plus, Trash2 } from "lucide-react";
import {
  QuoteLineNameAutocomplete,
  type PriceBookPick,
} from "./QuoteLineNameAutocomplete";
import { formatMoneyMinor, majorInputToMinor, minorToMajorInput } from "./quoteMoney";

export type EditableQuoteLine = {
  localId: string;
  name: string;
  description: string;
  category: MaintenancePriceBookCategory;
  unit: MaintenancePriceBookUnit;
  quantity: number;
  unitPriceMinor: number;
  vatRate: MaintenancePriceBookVatRate;
  priceBookItemId: string | null;
  /** Catalog name when soft-linked — cleared if name diverges. */
  linkedCatalogName: string | null;
};

interface QuoteLinesEditorProps {
  lines: EditableQuoteLine[];
  currency: string;
  disabled?: boolean;
  onChange: (lines: EditableQuoteLine[]) => void;
}

function newBlankLine(): EditableQuoteLine {
  return {
    localId: `local-${crypto.randomUUID()}`,
    name: "",
    description: "",
    category: "labour",
    unit: "hour",
    quantity: 1,
    unitPriceMinor: 0,
    vatRate: "standard_20",
    priceBookItemId: null,
    linkedCatalogName: null,
  };
}

export function ensureMinBlankLine(lines: EditableQuoteLine[]): EditableQuoteLine[] {
  if (lines.length === 0) return [newBlankLine()];
  return lines;
}

export function blankQuoteLine(): EditableQuoteLine {
  return newBlankLine();
}

export const QuoteLinesEditor = ({
  lines,
  currency,
  disabled,
  onChange,
}: QuoteLinesEditorProps) => {
  const updateAt = (index: number, patch: Partial<EditableQuoteLine>) => {
    const next = lines.map((line, i) => {
      if (i !== index) return line;
      const merged = { ...line, ...patch };
      if (
        merged.priceBookItemId &&
        merged.linkedCatalogName &&
        patch.name !== undefined &&
        patch.name.trim() !== merged.linkedCatalogName.trim()
      ) {
        merged.priceBookItemId = null;
        merged.linkedCatalogName = null;
      }
      return merged;
    });
    onChange(ensureMinBlankLine(next));
  };

  const removeAt = (index: number) => {
    const next = lines.filter((_, i) => i !== index);
    onChange(ensureMinBlankLine(next));
  };

  const duplicateAt = (index: number) => {
    const src = lines[index];
    if (!src) return;
    const copy: EditableQuoteLine = {
      ...src,
      localId: `local-${crypto.randomUUID()}`,
    };
    const next = [...lines];
    next.splice(index + 1, 0, copy);
    onChange(next);
  };

  const applyPick = (index: number, item: PriceBookPick) => {
    updateAt(index, {
      name: item.name,
      description: item.description || "",
      unit: (MAINTENANCE_PRICE_BOOK_UNITS as readonly string[]).includes(item.unit)
        ? (item.unit as MaintenancePriceBookUnit)
        : "hour",
      category: (MAINTENANCE_PRICE_BOOK_CATEGORIES as readonly string[]).includes(item.category)
        ? (item.category as MaintenancePriceBookCategory)
        : "labour",
      vatRate: (MAINTENANCE_PRICE_BOOK_VAT_RATES as readonly string[]).includes(item.vatRate)
        ? (item.vatRate as MaintenancePriceBookVatRate)
        : "standard_20",
      unitPriceMinor: item.unitPriceMinor,
      priceBookItemId: item.id,
      linkedCatalogName: item.name,
    });
  };

  const computed = lines.map((line) =>
    computeQuoteLine({
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      vatRate: line.vatRate,
    }),
  );
  const totals = computeQuoteTotals(computed);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Category / Description</th>
              <th className="w-20 px-2 py-2 font-medium">Qty</th>
              <th className="w-28 px-2 py-2 font-medium">Rate</th>
              <th className="w-24 px-2 py-2 font-medium text-right">Total</th>
              <th className="w-24 px-2 py-2 font-medium">VAT</th>
              <th className="w-20 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const maths = computed[index];
              return (
                <tr key={line.localId} className="border-b align-top last:border-b-0">
                  <td className="space-y-1.5 px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={line.category}
                        disabled={disabled}
                        onValueChange={(v) =>
                          updateAt(index, { category: v as MaintenancePriceBookCategory })
                        }
                      >
                        <SelectTrigger className="h-8 w-[8.5rem]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MAINTENANCE_PRICE_BOOK_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {MAINTENANCE_PRICE_BOOK_CATEGORY_LABELS[c]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={line.unit}
                        disabled={disabled}
                        onValueChange={(v) =>
                          updateAt(index, { unit: v as MaintenancePriceBookUnit })
                        }
                      >
                        <SelectTrigger className="h-8 w-[7.5rem]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MAINTENANCE_PRICE_BOOK_UNITS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {MAINTENANCE_PRICE_BOOK_UNIT_LABELS[u]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <QuoteLineNameAutocomplete
                      value={line.name}
                      currency={currency}
                      disabled={disabled}
                      testId={`input-quote-line-name-${index}`}
                      onNameChange={(name) => updateAt(index, { name })}
                      onPick={(item) => applyPick(index, item)}
                    />
                    <Input
                      value={line.description}
                      disabled={disabled}
                      placeholder="Optional detail"
                      className="h-8 text-xs"
                      onChange={(e) => updateAt(index, { description: e.target.value })}
                    />
                    {line.priceBookItemId ? (
                      <p className="text-[11px] text-muted-foreground">Linked to price book</p>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={disabled}
                      className="h-9"
                      value={line.quantity}
                      onChange={(e) =>
                        updateAt(index, {
                          quantity: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={disabled}
                      className="h-9"
                      value={minorToMajorInput(line.unitPriceMinor)}
                      onChange={(e) =>
                        updateAt(index, {
                          unitPriceMinor: majorInputToMinor(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium">
                    {formatMoneyMinor(maths.lineNetMinor, currency)}
                  </td>
                  <td className="px-2 py-2">
                    <Select
                      value={line.vatRate}
                      disabled={disabled}
                      onValueChange={(v) =>
                        updateAt(index, { vatRate: v as MaintenancePriceBookVatRate })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MAINTENANCE_PRICE_BOOK_VAT_RATES.map((v) => (
                          <SelectItem key={v} value={v}>
                            {MAINTENANCE_PRICE_BOOK_VAT_LABELS[v]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={disabled}
                        title="Duplicate"
                        onClick={() => duplicateAt(index)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        disabled={disabled || lines.length <= 1}
                        title="Delete"
                        onClick={() => removeAt(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...lines, newBlankLine()])}
          data-testid="button-add-quote-line"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add line item
        </Button>
        <div className="ml-auto space-y-1 text-sm tabular-nums">
          <div className="flex justify-between gap-8 text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatMoneyMinor(totals.subtotalMinor, currency)}</span>
          </div>
          <div className="flex justify-between gap-8 text-muted-foreground">
            <span>VAT</span>
            <span>{formatMoneyMinor(totals.taxMinor, currency)}</span>
          </div>
          <div className="flex justify-between gap-8 text-base font-semibold">
            <span>Total proposed</span>
            <span data-testid="text-quote-total">
              {formatMoneyMinor(totals.totalMinor, currency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
