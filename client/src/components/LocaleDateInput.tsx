import { forwardRef, useEffect, useState } from "react";
import { parse, format, isValid } from "date-fns";
import { useLocale } from "@/contexts/LocaleContext";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIncomingToYmd(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return isNaN(value.getTime()) ? "" : toYmd(value);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : toYmd(d);
}

export interface LocaleDateInputProps
  extends Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> {
  value?: string | Date | null;
  /** Called with `YYYY-MM-DD` when valid, or `null` when cleared. */
  onChange: (ymd: string | null) => void;
}

export const LocaleDateInput = forwardRef<HTMLInputElement, LocaleDateInputProps>(
  function LocaleDateInput({ value, onChange, className, onBlur, ...props }, ref) {
    const { dateFormat } = useLocale();
    const placeholder = dateFormat.toLowerCase();
    const ymdFromProp = parseIncomingToYmd(value);

    const [text, setText] = useState(() =>
      ymdFromProp ? format(new Date(`${ymdFromProp}T12:00:00`), dateFormat) : "",
    );

    useEffect(() => {
      const y = parseIncomingToYmd(value);
      setText(y ? format(new Date(`${y}T12:00:00`), dateFormat) : "");
    }, [value, dateFormat]);

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          const raw = text.trim();
          if (!raw) {
            onChange(null);
            setText("");
          } else {
            const parsed = parse(raw, dateFormat, new Date());
            if (isValid(parsed)) {
              const ymd = toYmd(parsed);
              onChange(ymd);
              setText(format(parsed, dateFormat));
            } else {
              const y = parseIncomingToYmd(value);
              setText(y ? format(new Date(`${y}T12:00:00`), dateFormat) : "");
            }
          }
          onBlur?.(e);
        }}
        className={cn(className)}
        {...props}
      />
    );
  },
);
