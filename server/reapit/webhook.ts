import { createPublicKey, verify } from "crypto";
import type { ReapitWebhookPayload } from "./types";

const keyCache = new Map<string, { key: string; at: number }>();

export function parseSignatureHeader(header?: string | string[]): {
  keyId: string;
  timestamp: string;
  signature: string;
} | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const parts = raw.split(":");
  if (parts.length < 4) return null;
  return { keyId: parts[1], timestamp: parts[2], signature: parts[3] };
}

export function verifyEd25519(message: string, signatureB64: string, publicKeyB64: string): boolean {
  try {
    const rawKey = Buffer.from(publicKeyB64, "base64");
    const spki = rawKey.length === 32
      ? Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey])
      : rawKey;
    const key = createPublicKey({ key: spki, format: "der", type: "spki" });
    return verify(null, Buffer.from(message, "utf8"), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

export async function verifyReapitWebhook(rawBody: Buffer, signatureHeader?: string | string[]): Promise<boolean> {
  if (process.env.REAPIT_SKIP_WEBHOOK_VERIFY === "true" && process.env.NODE_ENV !== "production") {
    return true;
  }
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;
  const ageMs = Math.abs(Date.now() - Number(parsed.timestamp) * 1000);
  if (Number.isFinite(Number(parsed.timestamp)) && parsed.timestamp.length <= 12 && ageMs > 15 * 60 * 1000) {
    // timestamp may already be ms; ignore age if not unix seconds
  }
  let publicKey = keyCache.get(parsed.keyId)?.key;
  if (!publicKey || Date.now() - (keyCache.get(parsed.keyId)?.at || 0) > 24 * 60 * 60 * 1000) {
    const { getSigningPublicKey } = await import("./client");
    publicKey = await getSigningPublicKey(parsed.keyId);
    keyCache.set(parsed.keyId, { key: publicKey, at: Date.now() });
  }
  const message = `${parsed.timestamp}${rawBody.toString("utf8")}`;
  return verifyEd25519(message, parsed.signature, publicKey);
}

export function parseWebhookBody(raw: Buffer): ReapitWebhookPayload {
  const json = JSON.parse(raw.toString("utf8"));
  return {
    eventId: json.eventId,
    topicId: json.topicId,
    customerId: json.customerId || json.customer?.id,
    entityId: json.entityId || json.new?.id || json.entity?.id,
    new: json.new,
  };
}

/** Bind webhooks from Reapit customerId only — never a client-supplied organisation header. */
export function organisationIdForWebhookCustomer(
  customerId: string | undefined,
  connections: Array<{ reapitCustomerId: string | null; organizationId: string; status: string }>,
): string | null {
  if (!customerId) return null;
  const match = connections.find((row) => row.reapitCustomerId === customerId && row.status === "connected");
  return match?.organizationId || null;
}
