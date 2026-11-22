export function formatMoneyMinor(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

export function majorInputToMinor(raw: string): number {
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function minorToMajorInput(minor: number): string {
  if (!Number.isFinite(minor)) return "0";
  return (minor / 100).toFixed(2);
}
