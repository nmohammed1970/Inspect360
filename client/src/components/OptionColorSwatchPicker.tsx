import { useState } from "react";
import {
  FIELD_OPTION_PALETTE,
  resolvePaletteHex,
  type FieldOptionPaletteId,
} from "@shared/fieldOptionColors";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  value?: string | null;
  onChange: (colorId: string | undefined) => void;
  /** Accessible label for the trigger */
  "aria-label"?: string;
  className?: string;
};

/** Compact 10-swatch popover for template option colors. */
export function OptionColorSwatchPicker({
  value,
  onChange,
  "aria-label": ariaLabel = "Option color",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const hex = resolvePaletteHex(value || undefined);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "h-9 w-9 shrink-0 rounded-full p-0 border-2 border-slate-400 bg-white hover:bg-slate-50 hover:border-slate-500 shadow-sm",
            className,
          )}
          aria-label={ariaLabel}
          title={ariaLabel}
        >
          <span
            className="block h-5 w-5 rounded-full border border-slate-500/40 shadow-inner"
            style={{
              backgroundColor: hex || "#94a3b8",
              backgroundImage: hex
                ? undefined
                : "repeating-conic-gradient(#cbd5e1 0% 25%, #f8fafc 0% 50%)",
              backgroundSize: hex ? undefined : "8px 8px",
            }}
            aria-hidden
          />
        </Button>
      </PopoverTrigger>
      {/* z-[120]: TemplateBuilder lives in Dialog (z-60); default popover z-50 opens behind it */}
      <PopoverContent
        className="w-auto p-3 z-[120]"
        align="end"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <p className="text-xs text-muted-foreground mb-2">Color</p>
        <div className="grid grid-cols-5 gap-2">
          {FIELD_OPTION_PALETTE.map((swatch) => {
            const selected = value === swatch.id;
            return (
              <button
                key={swatch.id}
                type="button"
                title={swatch.label}
                aria-label={swatch.label}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-foreground scale-110" : "border-slate-300",
                )}
                style={{ backgroundColor: swatch.hex }}
                onClick={() => {
                  onChange(swatch.id as FieldOptionPaletteId);
                  setOpen(false);
                }}
              />
            );
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full mt-2 h-8 text-xs"
          onClick={() => {
            onChange(undefined);
            setOpen(false);
          }}
        >
          Clear color
        </Button>
      </PopoverContent>
    </Popover>
  );
}
