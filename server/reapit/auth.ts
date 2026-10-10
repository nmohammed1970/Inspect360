import type { TokenBundle } from "./types";
import { getConnectionByOrg, readTokens, upsertConnection } from "./repository";
import { signOAuthState, verifyOAuthState } from "./crypto";

const CONNECT_URL = () => process.env.REAPIT_CONNECT_URL || "https://connect.reapit.cloud";
const CLIENT_ID = () => process.env.REAPIT_CLIENT_ID || "";
const CLIENT_SECRET = () => process.env.REAPIT_CLIENT_SECRET || "";

export function redirectUri(): string {
  if (process.env.REAPIT_REDIRECT_URI) return process.env.REAPIT_REDIRECT_URI;
  const base = (process.env.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
  return `${base}/api/reapit/oauth/callback`;
}

export function buildAuthorizeUrl(organizationId: string): string {
  if (!CLIENT_ID()) throw new Error("REAPIT_CLIENT_ID is not configured");
  const state = signOAuthState({
    organizationId,
    nonce: Date.now(),
    exp: Date.now() + 10 * 60 * 1000,
  });
  const url = new URL(`${CONNECT_URL()}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID());
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set(
    "scope",
    "properties.read contacts.read landlords.read tenancies.read tenancies.write",
  );
  return url.toString();
}

export function parseOAuthState(state: string): { organizationId: string } {
  const payload = verifyOAuthState(state);
  const organizationId = String(payload.organizationId || "");
  const exp = Number(payload.exp || 0);
  if (!organizationId) throw new Error("OAuth state missing organisation");
  if (exp && Date.now() > exp) throw new Error("OAuth state expired");
  return { organizationId };
}

async function tokenRequest(body: URLSearchParams): Promise<any> {
  const res = await fetch(`${CONNECT_URL()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error_description || json.error || `Token request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

export async function exchangeAuthorizationCode(code: string): Promise<TokenBundle> {
  const json = await tokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      redirect_uri: redirectUri(),
      code,
    }),
  );
  return toBundle(json);
}

async function clientCredentialsToken(): Promise<TokenBundle | null> {
  if (!CLIENT_ID() || !CLIENT_SECRET()) return null;
  try {
    const json = await tokenRequest(
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID(),
        client_secret: CLIENT_SECRET(),
      }),
    );
    return toBundle(json);
  } catch (error: any) {
    console.warn("[Reapit] Client credentials grant unavailable:", error.message);
    return null;
  }
}

async function refreshAccessToken(refreshToken: string): Promise<TokenBundle> {
  const json = await tokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      refresh_token: refreshToken,
    }),
  );
  return toBundle(json, refreshToken);
}

function toBundle(json: any, previousRefresh?: string): TokenBundle {
  const expiresIn = Number(json.expires_in || 3600);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || previousRefresh,
    accessExpiresAt: Date.now() + Math.max(30, expiresIn - 60) * 1000,
    tokenType: json.token_type,
  };
}

export function extractCustomerIdFromAccessToken(accessToken?: string): string | null {
  if (!accessToken || accessToken.split(".").length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
    const candidates = [
      payload.customerId,
      payload.customer,
      payload["https://reapit.com/customer"],
      payload["custom:reapit:customerId"],
      payload["https://reapit-platform/customer"],
    ];
    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    return null;
  }
  return null;
}

export async function getAccessTokenForOrg(organizationId: string): Promise<{
  accessToken: string;
  customerId: string;
}> {
  const connection = await getConnectionByOrg(organizationId);
  if (!connection || connection.status !== "connected") {
    throw new Error("Reapit is not connected for this organisation");
  }
  const customerId = connection.reapitCustomerId;
  if (!customerId) throw new Error("Reapit customer id is missing");

  const cc = await clientCredentialsToken();
  if (cc?.accessToken) {
    return { accessToken: cc.accessToken, customerId };
  }

  let tokens = readTokens(connection);
  if (!tokens || (!tokens.accessToken && !tokens.refreshToken)) {
    throw new Error("Reapit tokens are missing");
  }
  if (!tokens.accessToken || (tokens.accessExpiresAt && Date.now() > tokens.accessExpiresAt)) {
    if (!tokens.refreshToken) throw new Error("Reapit refresh token is missing");
    tokens = await rotateRefreshToken(organizationId, customerId, tokens.refreshToken);
  }
  return { accessToken: tokens.accessToken!, customerId };
}

const refreshMutex = new Map<string, Promise<TokenBundle>>();

async function rotateRefreshToken(organizationId: string, customerId: string, refreshToken: string): Promise<TokenBundle> {
  const existing = refreshMutex.get(organizationId);
  if (existing) return existing;
  const pending = (async () => {
    const latest = await getConnectionByOrg(organizationId);
    const latestTokens = latest ? readTokens(latest) : null;
    if (
      latestTokens?.accessToken &&
      latestTokens.accessExpiresAt &&
      Date.now() < latestTokens.accessExpiresAt &&
      latestTokens.refreshToken !== refreshToken
    ) {
      return latestTokens;
    }
    const tokens = await refreshAccessToken(latestTokens?.refreshToken || refreshToken);
    await upsertConnection({
      organizationId,
      reapitCustomerId: customerId,
      status: "connected",
      tokens,
    });
    return tokens;
  })().finally(() => refreshMutex.delete(organizationId));
  refreshMutex.set(organizationId, pending);
  return pending;
}
