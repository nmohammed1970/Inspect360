/**
 * Fixed palette + helpers for Dropdown / Yes-No option colors on inspection templates.
 * Entry valueJson stays a plain string or boolean; colors live only on template fields.
 */

export const FIELD_OPTION_PALETTE = [
  { id: "amber", label: "Amber", hex: "#f59e0b" },
  { id: "red", label: "Red", hex: "#ef4444" },
  { id: "orange", label: "Orange", hex: "#f97316" },
  { id: "green", label: "Green", hex: "#22c55e" },
  { id: "teal", label: "Teal", hex: "#14b8a6" },
  { id: "blue", label: "Blue", hex: "#3b82f6" },
  { id: "indigo", label: "Indigo", hex: "#6366f1" },
  { id: "purple", label: "Purple", hex: "#a855f7" },
  { id: "pink", label: "Pink", hex: "#ec4899" },
  { id: "yellow", label: "Yellow", hex: "#eab308" },
] as const;

export type FieldOptionPaletteId = (typeof FIELD_OPTION_PALETTE)[number]["id"];

export type FieldOption =
  | string
  | { value: string; label?: string; color?: string };

export type NormalizedFieldOption = {
  value: string;
  label: string;
  /** Palette id or raw hex */
  color?: string;
};

export type BooleanOptionColors = {
  yes?: string;
  no?: string;
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isFieldOptionPaletteId(value: string | null | undefined): value is FieldOptionPaletteId {
  if (!value) return false;
  return FIELD_OPTION_PALETTE.some((p) => p.id === value);
}

/** Legacy ids removed from the picker but still resolved for saved templates. */
const LEGACY_PALETTE_HEX: Record<string, string> = {
  slate: "#64748b",
};

/** Resolve palette id or #hex to a CSS hex. */
export function resolvePaletteHex(color: string | null | undefined): string | undefined {
  if (!color || typeof color !== "string") return undefined;
  const trimmed = color.trim();
  if (!trimmed) return undefined;
  const fromPalette = FIELD_OPTION_PALETTE.find((p) => p.id === trimmed);
  if (fromPalette) return fromPalette.hex;
  if (LEGACY_PALETTE_HEX[trimmed]) return LEGACY_PALETTE_HEX[trimmed];
  if (HEX_RE.test(trimmed)) {
    if (trimmed.length === 4) {
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return trimmed.toLowerCase();
  }
  return undefined;
}

export function normalizeFieldOptions(
  options?: FieldOption[] | null,
): NormalizedFieldOption[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((o) => {
      if (typeof o === "string") {
        return { value: o, label: o };
      }
      if (o && typeof o === "object" && typeof o.value === "string") {
        const value = o.value;
        return {
          value,
          label: typeof o.label === "string" && o.label.trim() ? o.label : value,
          color: typeof o.color === "string" && o.color.trim() ? o.color.trim() : undefined,
        };
      }
      return null;
    })
    .filter((o): o is NormalizedFieldOption => !!o);
}

/** Plain option labels for selects that still need string[]. */
export function fieldOptionValues(options?: FieldOption[] | null): string[] {
  return normalizeFieldOptions(options).map((o) => o.value);
}

export function resolveOptionColor(
  options: FieldOption[] | undefined | null,
  selected: string | null | undefined,
): string | undefined {
  if (selected == null || selected === "") return undefined;
  const match = normalizeFieldOptions(options).find((o) => o.value === selected);
  return resolvePaletteHex(match?.color);
}

export function resolveBooleanOptionColor(
  field: { booleanColors?: BooleanOptionColors | null } | null | undefined,
  value: boolean | null | undefined,
): string | undefined {
  if (value !== true && value !== false) return undefined;
  const key = value ? "yes" : "no";
  return resolvePaletteHex(field?.booleanColors?.[key]);
}

/** Soft pill styles: light fill + border + readable text (no shadow / not bold). */
export function optionPillStyle(hex: string | undefined): {
  backgroundColor: string;
  borderColor: string;
  color: string;
} | null {
  if (!hex) return null;
  return {
    backgroundColor: hexToRgba(hex, 0.14),
    borderColor: hexToRgba(hex, 0.4),
    color: hex,
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = resolvePaletteHex(hex) || hex;
  const raw = normalized.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(100,116,139,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Persist helper: keep plain string when no color; object when color is set. */
export function serializeFieldOption(value: string, color?: string | null): FieldOption {
  const trimmed = value ?? "";
  if (color && String(color).trim()) {
    return { value: trimmed, color: String(color).trim() };
  }
  return trimmed;
}
