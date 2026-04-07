/** Same rules as @shared/locationLabels — property/block name before address in UI. */

export type PropertyLocationFields = { name: string | null | undefined; address: string | null | undefined };
export type BlockLocationFields = { name: string | null | undefined; address: string | null | undefined };

export function formatPropertyLocationLabel(p: PropertyLocationFields): string {
  const name = (p.name ?? '').trim();
  const addr = (p.address ?? '').trim();
  if (name && addr) return `${name} — ${addr}`;
  return name || addr || '';
}

export function formatBlockLocationLabel(b: BlockLocationFields): string {
  const name = (b.name ?? '').trim();
  const addr = (b.address ?? '').trim();
  if (name && addr) return `${name} — ${addr}`;
  return name || addr || '';
}
