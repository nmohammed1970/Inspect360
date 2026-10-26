import { optionPillStyle } from "@shared/fieldOptionColors";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  /** Resolved CSS hex from palette helpers */
  colorHex?: string | null;
  className?: string;
};

/** Soft colored pill for select / Yes-No values (capture, report, review). */
export function OptionValueBadge({ label, colorHex, className }: Props) {
  const style = optionPillStyle(colorHex || undefined);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium tracking-normal",
        !style && "border-border bg-muted/40 text-foreground",
        className,
      )}
      style={style || undefined}
    >
      {label}
    </span>
  );
}
