import type { ReapitAddress, ReapitContact, ReapitProperty, ReapitTenancy } from "./types";

export function formatReapitAddress(address?: ReapitAddress | null): string {
  if (!address) return "";
  return [
    [address.buildingNumber, address.buildingName].filter(Boolean).join(" "),
    address.line1,
    address.line2,
    address.line3,
    address.line4,
    address.postcode,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

export function isLettingProperty(property: ReapitProperty): boolean {
  const mode = String(property.marketingMode || "").toLowerCase();
  if (mode === "letting" || mode === "sellingandletting" || mode.includes("letting")) return true;
  if (property.letting && typeof property.letting === "object") return true;
  return false;
}

export function mapProperty(property: ReapitProperty): { name: string; address: string; propertyType: string | null } {
  const address = formatReapitAddress(property.address) || "Address unknown";
  const name =
    property.address?.buildingName ||
    property.address?.buildingNumber ||
    property.id ||
    "Reapit property";
  const type = Array.isArray(property.type) ? property.type[0] : undefined;
  return {
    name: String(name),
    address,
    propertyType: type ? String(type).toLowerCase() : null,
  };
}

export function mapContact(contact: ReapitContact): {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
} {
  return {
    firstName: contact.forename?.trim() || "Unknown",
    lastName: contact.surname?.trim() || "Contact",
    email: contact.email?.trim() || null,
    phone: contact.mobilePhone || contact.homePhone || contact.workPhone || null,
    address: formatReapitAddress(contact.primaryAddress) || null,
    city: contact.primaryAddress?.line4 || contact.primaryAddress?.line3 || null,
    postalCode: contact.primaryAddress?.postcode || null,
    country: contact.primaryAddress?.countryId || null,
  };
}

export function mapTenancy(tenancy: ReapitTenancy): {
  leaseStartDate: Date | null;
  leaseEndDate: Date | null;
  monthlyRent: string | null;
  depositAmount: string | null;
  isActive: boolean;
} {
  const status = String(tenancy.status || "").toLowerCase();
  const ended = ["ended", "cancelled", "archived", "withdrawn"].includes(status) || tenancy.isDeleted === true;
  const rent = tenancy.rent == null || tenancy.rent === "" ? null : String(tenancy.rent);
  const freq = String(tenancy.rentFrequency || "monthly").toLowerCase();
  let monthly = rent;
  if (rent && freq.includes("week") && !freq.includes("4")) {
    monthly = String(Math.round((parseFloat(rent) * 52) / 12 * 100) / 100);
  }
  return {
    leaseStartDate: tenancy.startDate ? new Date(tenancy.startDate) : null,
    leaseEndDate: tenancy.endDate ? new Date(tenancy.endDate) : null,
    monthlyRent: monthly,
    depositAmount: tenancy.deposit == null || tenancy.deposit === "" ? null : String(tenancy.deposit),
    isActive: !ended,
  };
}

export function relatedIds(related: Array<{ associatedType?: string; associatedId?: string }> | undefined, type: string): string[] {
  return (related || [])
    .filter((row) => String(row.associatedType || "").toLowerCase() === type.toLowerCase() && row.associatedId)
    .map((row) => String(row.associatedId));
}

export function syntheticEmail(reapitId: string): string {
  return `reapit+${reapitId.toLowerCase()}@noreply.inspect360.local`;
}
