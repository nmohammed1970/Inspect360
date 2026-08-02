import { ANNUAL_MULTIPLIER, type TierId } from "./billingTiers";

export interface TenantPortalBand {
  maxUnits: number | null;
  price: number; // monthly GBP
}

export interface RetentionTerm {
  months: number | null; // null = unlimited
  price: number; // monthly GBP
  label: string;
}

export interface ModuleConfig {
  id: string;
  label: string;
  description: string;
  minTier: TierId;
  /** Flat monthly price, or null when price comes from bands/terms */
  price: number | null;
  bands?: TenantPortalBand[];
  terms?: RetentionTerm[];
}

export const MODULES: readonly ModuleConfig[] = [
  {
    id: "tenant_portal",
    label: "Tenant Portal",
    description: "Self-serve tenant access for requests, documents, and updates.",
    minTier: "growth",
    price: null,
    bands: [
      { maxUnits: 250, price: 100 },
      { maxUnits: 1000, price: 175 },
      { maxUnits: 2500, price: 250 },
      { maxUnits: null, price: 300 },
    ],
  },
  {
    id: "dispute_portal",
    label: "Dispute Portal",
    description: "Structured dispute workflows with evidence attached to each claim.",
    minTier: "growth",
    price: 150,
  },
  {
    id: "retention_ext",
    label: "Extended Evidence Retention",
    description: "Keep photos and reports beyond the 24-month default.",
    minTier: "growth",
    price: null,
    terms: [
      { months: 48, price: 75, label: "48 months" },
      { months: 72, price: 150, label: "72 months" },
      { months: null, price: 250, label: "Unlimited" },
    ],
  },
  {
    id: "ivy_tenant",
    label: "IVY Tenant Maintenance Bot",
    description: "AI assistant for tenant maintenance triage and responses.",
    minTier: "professional",
    price: 100,
  },
  {
    id: "ivy_hq",
    label: "IVY HQ Operations Bot",
    description: "AI assistant for internal operations and portfolio workflows.",
    minTier: "professional",
    price: 50,
  },
  {
    id: "white_label",
    label: "White Labelling",
    description: "Brand the product with your logo, colours, and domain.",
    minTier: "professional",
    price: 250,
  },
] as const;

export function resolveTenantPortalPrice(unitsUnderMgmt: number): number {
  const mod = MODULES.find((m) => m.id === "tenant_portal");
  if (!mod?.bands) return 100;
  for (const band of mod.bands) {
    if (band.maxUnits === null || unitsUnderMgmt <= band.maxUnits) return band.price;
  }
  return mod.bands[mod.bands.length - 1].price;
}

export function moduleMonthlyPrice(moduleId: string, unitsUnderMgmt = 0, retentionMonths: number | null = 48): number | null {
  const mod = MODULES.find((m) => m.id === moduleId);
  if (!mod) return null;
  if (mod.id === "tenant_portal") return resolveTenantPortalPrice(unitsUnderMgmt);
  if (mod.id === "retention_ext" && mod.terms) {
    const term =
      mod.terms.find((t) => t.months === retentionMonths) ||
      mod.terms.find((t) => t.months === null) ||
      mod.terms[0];
    return term.price;
  }
  return mod.price;
}

export function moduleAnnualPrice(monthly: number): number {
  return monthly * 12 * ANNUAL_MULTIPLIER;
}
