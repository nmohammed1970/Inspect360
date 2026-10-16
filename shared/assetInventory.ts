/** Canonical asset inventory categories + enum helpers (web + mobile + AI). */

export const ASSET_CATEGORIES = [
  "HVAC",
  "Appliances",
  "Furniture",
  "Plumbing",
  "Electrical",
  "Flooring",
  "Windows & Doors",
  "Security",
  "Landscaping",
  "Lighting",
  "Kitchen Equipment",
  "Bathroom Fixtures",
  "Other",
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const ASSET_CONDITIONS = [
  "excellent",
  "good",
  "fair",
  "poor",
  "needs_replacement",
] as const;

export type AssetCondition = (typeof ASSET_CONDITIONS)[number];

export const ASSET_CLEANLINESS = [
  "very_clean",
  "clean",
  "acceptable",
  "needs_cleaning",
  "not_applicable",
] as const;

export type AssetCleanliness = (typeof ASSET_CLEANLINESS)[number];

export const ASSET_CONDITION_LABELS: Record<AssetCondition, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  needs_replacement: "Needs Replacement",
};

export const ASSET_CLEANLINESS_LABELS: Record<AssetCleanliness, string> = {
  very_clean: "Very Clean",
  clean: "Clean",
  acceptable: "Acceptable",
  needs_cleaning: "Needs Cleaning",
  not_applicable: "Not Applicable",
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function coerceAssetCategory(raw: string | null | undefined): AssetCategory {
  const n = norm(raw || "");
  if (!n) return "Other";
  const exact = ASSET_CATEGORIES.find((c) => norm(c) === n);
  if (exact) return exact;
  if (n.includes("hvac") || n.includes("heating") || n.includes("cooling") || n.includes("air con")) {
    return "HVAC";
  }
  if (n.includes("appliance") || n.includes("fridge") || n.includes("washer") || n.includes("dryer") || n.includes("oven") || n.includes("dishwasher")) {
    return "Appliances";
  }
  if (n.includes("furnitur") || n.includes("sofa") || n.includes("bed") || n.includes("table") || n.includes("chair")) {
    return "Furniture";
  }
  if (n.includes("plumb") || n.includes("tap") || n.includes("faucet") || n.includes("toilet") || n.includes("sink")) {
    return "Plumbing";
  }
  if (n.includes("electric") || n.includes("outlet") || n.includes("socket") || n.includes("switchboard")) {
    return "Electrical";
  }
  if (n.includes("floor")) return "Flooring";
  if (n.includes("window") || n.includes("door")) return "Windows & Doors";
  if (n.includes("secur") || n.includes("alarm") || n.includes("camera") || n.includes("lock")) return "Security";
  if (n.includes("garden") || n.includes("landscape") || n.includes("lawn")) return "Landscaping";
  if (n.includes("light") || n.includes("lamp") || n.includes("bulb")) return "Lighting";
  if (n.includes("kitchen")) return "Kitchen Equipment";
  if (n.includes("bath")) return "Bathroom Fixtures";
  return "Other";
}

export function coerceAssetCondition(raw: string | null | undefined): AssetCondition {
  const n = norm(raw || "");
  if (n.includes("need") && n.includes("replace")) return "needs_replacement";
  if (n === "excellent" || n === "like new") return "excellent";
  if (n === "good") return "good";
  if (n === "fair" || n === "average") return "fair";
  if (n === "poor" || n === "bad" || n === "damaged") return "poor";
  if (ASSET_CONDITIONS.includes(n as AssetCondition)) return n as AssetCondition;
  return "good";
}

export function coerceAssetCleanliness(raw: string | null | undefined): AssetCleanliness {
  const n = norm(raw || "");
  if (n.includes("very clean") || n === "excellent" || n === "spotless") return "very_clean";
  if (n === "clean" || n === "good") return "clean";
  if (n === "acceptable" || n === "fair" || n === "average") return "acceptable";
  if (n.includes("need") && n.includes("clean")) return "needs_cleaning";
  if (n.includes("not applicable") || n === "n/a" || n === "na") return "not_applicable";
  if (n === "poor" || n === "dirty" || n.includes("very poor")) return "needs_cleaning";
  if (ASSET_CLEANLINESS.includes(n as AssetCleanliness)) return n as AssetCleanliness;
  return "clean";
}
