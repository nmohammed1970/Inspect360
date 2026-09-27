/** Currency formatting for tenant portal (parity with web locale.formatCurrency defaulting to GBP). */

export function formatCurrency(
  value: unknown,
  options?: { currency?: string; showSymbol?: boolean },
): string | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return String(value);
  const currency = options?.currency || 'GBP';
  const showSymbol = options?.showSymbol !== false;
  try {
    return new Intl.NumberFormat(undefined, {
      style: showSymbol ? 'currency' : 'decimal',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    const formatted = n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return showSymbol ? `£${formatted}` : formatted;
  }
}
