import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const VAT_SHORT_LABELS: Record<MaintenancePriceBookVatRate, string> = {
  standard_20: "20%",
  exempt: "Exempt",
  zero_rated: "0%",
  reduced: "Reduced",
};

export type EditableQuoteLine = {
  localId: string;
  name: string;
  description: string;
  sku: string;
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
  /** Footer total label — defaults to quote wording. */
  totalLabel?: string;
}

function newBlankLine(): EditableQuoteLine {
  return {
    localId: `local-${crypto.randomUUID()}`,
    name: "",
    description: "",
    sku: "",
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

const fieldLabelClass = "text-xs font-medium text-muted-foreground";
const controlClass = "h-10 bg-muted/30";

export const QuoteLinesEditor = ({
  lines,
  currency,
  disabled,
  onChange,
  totalLabel = "Total Proposed",
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
      sku: item.sku || "",
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
    <div className="space-y-4">
      <div className="space-y-3">
        {lines.map((line, index) => {
          const maths = computed[index];
          return (
            <div
              key={line.localId}
              className="rounded-xl border bg-card p-4 shadow-sm"
              data-testid={`quote-line-card-${index}`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Line Item {index + 1}
                  {line.priceBookItemId ? (
                    <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/80">
                      · From Price Book
                    </span>
                  ) : null}
                </p>
                <div className="flex items-center gap-0.5">
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
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={disabled || lines.length <= 1}
                    title="Delete"
                    onClick={() => removeAt(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                  <div className="space-y-1.5 md:col-span-6">
                    <Label className={fieldLabelClass}>
                      Item <span className="text-destructive">*</span>
                    </Label>
                    <QuoteLineNameAutocomplete
                      value={line.name}
                      currency={currency}
                      disabled={disabled}
                      testId={`input-quote-line-name-${index}`}
                      onNameChange={(name) => updateAt(index, { name })}
                      onPick={(item) => applyPick(index, item)}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-3">
                    <Label className={fieldLabelClass}>
                      Type <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={line.category}
                      disabled={disabled}
                      onValueChange={(v) =>
                        updateAt(index, { category: v as MaintenancePriceBookCategory })
                      }
                    >
                      <SelectTrigger className={controlClass}>
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
                  </div>
                  <div className="space-y-1.5 md:col-span-3">
                    <Label className={fieldLabelClass}>Part number</Label>
                    <Input
                      value={line.sku}
                      disabled={disabled}
                      placeholder="SKU / part #"
                      className={controlClass}
                      onChange={(e) => updateAt(index, { sku: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className={fieldLabelClass}>Description</Label>
                  <Input
                    value={line.description}
                    disabled={disabled}
                    placeholder="Optional description"
                    className={controlClass}
                    onChange={(e) => updateAt(index, { description: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-12">
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label className={fieldLabelClass}>
                      Quantity <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={disabled}
                      className={controlClass}
                      value={line.quantity}
                      onChange={(e) =>
                        updateAt(index, {
                          quantity: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label className={fieldLabelClass}>
                      Unit <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={line.unit}
                      disabled={disabled}
                      onValueChange={(v) =>
                        updateAt(index, { unit: v as MaintenancePriceBookUnit })
                      }
                    >
                      <SelectTrigger className={controlClass}>
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
                  <div className="col-span-2 space-y-1.5 sm:col-span-1 lg:col-span-3">
                    <Label className={fieldLabelClass}>
                      Unit price <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={disabled}
                      className={controlClass}
                      placeholder={`Unit price (${currency})`}
                      value={minorToMajorInput(line.unitPriceMinor)}
                      onChange={(e) =>
                        updateAt(index, {
                          unitPriceMinor: majorInputToMinor(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label className={fieldLabelClass}>VAT</Label>
                    <Select
                      value={line.vatRate}
                      disabled={disabled}
                      onValueChange={(v) =>
                        updateAt(index, { vatRate: v as MaintenancePriceBookVatRate })
                      }
                    >
                      <SelectTrigger className={controlClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MAINTENANCE_PRICE_BOOK_VAT_RATES.map((v) => (
                          <SelectItem key={v} value={v}>
                            {VAT_SHORT_LABELS[v]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 lg:col-span-3">
                    <Label className={fieldLabelClass}>Total</Label>
                    <div className="flex h-10 items-center justify-end rounded-md border bg-muted/20 px-3 text-sm font-semibold tabular-nums">
                      {formatMoneyMinor(maths.lineNetMinor, currency)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange([...lines, newBlankLine()])}
          data-testid="button-add-quote-line"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Line Item
        </Button>
        <div className="ml-auto min-w-[12rem] space-y-1.5 text-sm tabular-nums">
          <div className="flex justify-between gap-8 text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatMoneyMinor(totals.subtotalMinor, currency)}</span>
          </div>
          <div className="flex justify-between gap-8 text-muted-foreground">
            <span>VAT</span>
            <span>{formatMoneyMinor(totals.taxMinor, currency)}</span>
          </div>
          <div className="flex justify-between gap-8 border-t pt-1.5 text-base font-semibold">
            <span>{totalLabel}</span>
            <span data-testid="text-quote-total">
              {formatMoneyMinor(totals.totalMinor, currency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
