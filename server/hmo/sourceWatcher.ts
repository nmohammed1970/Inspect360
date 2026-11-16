import { runWeeklySourceWatcher } from "./regulatory";
import * as hmoStorage from "./storage";
import { writeHmoAuditEvent } from "./auditWriter";

/** Spec examples: GOV.UK + Westminster (scheme renewal ≠ invalidate every licence). */
export const DEFAULT_HMO_REGULATORY_SOURCES = [
  {
    authorityName: "GOV.UK — HMO licensing",
    sourceUrl: "https://www.gov.uk/house-in-multiple-occupation-licence",
    sourceType: "web",
  },
  {
    authorityName: "Westminster City Council — HMO licensing",
    sourceUrl: "https://www.westminster.gov.uk/licensing/houses-multiple-occupation-hmo",
    sourceType: "web",
  },
  {
    authorityName: "Ealing — Additional HMO licensing",
    sourceUrl: "https://www.ealing.gov.uk/info/201156/private_housing/2201/houses_in_multiple_occupation",
    sourceType: "web",
  },
] as const;

async function fetchSourceText(url: string): Promise<{ ok: boolean; text: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Inspect360-HMO-RuleWatcher/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, text: "", error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    return { ok: true, text: text.slice(0, 200_000) };
  } catch (error: any) {
    return { ok: false, text: "", error: error?.message || "fetch_failed" };
  }
}

/**
 * Weekly source check. Failed fetches record Source not verified (never silent no-change).
 */
export async function runScheduledSourceWatcher(organizationId?: string | null) {
  const results = [];
  for (const source of DEFAULT_HMO_REGULATORY_SOURCES) {
    const fetched = await fetchSourceText(source.sourceUrl);
    if (!fetched.ok) {
      const row = await hmoStorage.upsertRegulatorySource({
        organizationId: organizationId ?? null,
        authorityName: source.authorityName,
        sourceUrl: source.sourceUrl,
        sourceType: source.sourceType,
        contentHash: null,
        status: "SOURCE_NOT_VERIFIED",
      });
      results.push({
        sourceId: row.id,
        authorityName: source.authorityName,
        status: "SOURCE_NOT_VERIFIED",
        error: fetched.error,
        changed: false,
      });
      continue;
    }

    const [diff] = await runWeeklySourceWatcher({
      organizationId: organizationId ?? null,
      sources: [
        {
          authorityName: source.authorityName,
          sourceUrl: source.sourceUrl,
          fetchedText: fetched.text,
          sourceType: source.sourceType,
        },
      ],
    });
    results.push({
      ...diff,
      authorityName: source.authorityName,
      status: diff?.informationalOnly ? "INFORMATIONAL" : "ANALYST_QUEUE",
    });
  }

  if (organizationId) {
    await writeHmoAuditEvent({
      organizationId,
      actorType: "system",
      actorId: null,
      action: "hmo.regulatory.source_watch",
      entityType: "hmo_regulatory_source",
      entityId: organizationId,
      metadata: { resultCount: results.length },
    });
  }

  return results;
}
