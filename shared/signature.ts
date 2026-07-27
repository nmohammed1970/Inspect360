export type SignaturePayload = {
  image: string;
  signedByName?: string;
  signedAt?: string;
};

export function createSignatureValue(
  image: string,
  signedByName?: string,
  signedAt?: string,
): SignaturePayload {
  return {
    image,
    ...(signedByName ? { signedByName } : {}),
    signedAt: signedAt || new Date().toISOString(),
  };
}

/**
 * Normalize signature field values. Supports:
 * - plain data URL / typed name string (legacy)
 * - { image, signedByName, signedAt }
 * - nested under composite { value: ... }
 */
export function parseSignatureValue(value: unknown): SignaturePayload | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? { image: trimmed } : null;
  }

  if (typeof value !== "object") {
    return null;
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj.image === "string" && obj.image.trim()) {
    return {
      image: obj.image,
      signedByName: typeof obj.signedByName === "string" ? obj.signedByName : undefined,
      signedAt: typeof obj.signedAt === "string" ? obj.signedAt : undefined,
    };
  }

  if ("value" in obj) {
    const nested = parseSignatureValue(obj.value);
    if (!nested) return null;
    return {
      ...nested,
      signedByName:
        nested.signedByName ||
        (typeof obj.signedByName === "string" ? obj.signedByName : undefined),
      signedAt:
        nested.signedAt ||
        (typeof obj.signedAt === "string" ? obj.signedAt : undefined),
    };
  }

  return null;
}

export function isTenantSignatureField(field: {
  label?: string;
  key?: string;
  id?: string;
}): boolean {
  const text = `${field.label || ""} ${field.key || ""} ${field.id || ""}`.toLowerCase();
  return text.includes("tenant");
}

export function formatSignerDisplayName(user?: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
} | null): string {
  if (!user) return "";
  const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  if (fullName) return fullName;

  // Registration stores company name in username — use it only when it is not an email
  const username = (user.username || "").trim();
  if (username && !username.includes("@")) return username;

  // Never show a raw email; humanize the local-part as a last resort
  const email = (user.email || "").trim();
  if (email.includes("@")) {
    const local = email.split("@")[0] || "";
    const humanized = local
      .replace(/[._+-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
    if (humanized) return humanized;
  }

  return "";
}
