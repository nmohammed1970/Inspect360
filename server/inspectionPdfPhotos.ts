/**
 * Parallel photo embedding for inspection PDFs.
 * Fetches unique photo URLs once (object storage / HTTP) and returns data URLs.
 */
import { resolveReportImageToDataUrl } from "./reportPdfShared";

export function collectUniquePhotoUrls(
  entries: Array<{ photos?: string[] | null }>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    for (const photo of entry.photos || []) {
      if (typeof photo !== "string") continue;
      const trimmed = photo.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

/** Run async work over items with a fixed concurrency limit. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

/**
 * Resolve all unique entry photos to data URLs in parallel, then rewrite entry.photos.
 * Failed URLs keep the original path (Chromium may still fetch them).
 */
export async function embedInspectionEntryPhotos(
  entries: Array<{ photos?: string[] | null; [key: string]: any }>,
  baseUrl: string,
  concurrency = 8,
): Promise<Array<{ photos?: string[] | null; [key: string]: any }>> {
  const unique = collectUniquePhotoUrls(entries);
  if (unique.length === 0) return entries;

  const started = Date.now();
  console.log(`[PDF] Embedding ${unique.length} unique photo(s) (concurrency ${concurrency})...`);

  const resolved = await mapWithConcurrency(unique, concurrency, async (url) => {
    const dataUrl = await resolveReportImageToDataUrl(url, baseUrl);
    return { url, dataUrl };
  });

  const urlMap = new Map<string, string>();
  let ok = 0;
  for (const item of resolved) {
    if (item.dataUrl) {
      urlMap.set(item.url, item.dataUrl);
      ok++;
    }
  }

  console.log(
    `[PDF] Embedded ${ok}/${unique.length} photo(s) in ${Date.now() - started}ms`,
  );

  return entries.map((entry) => {
    const photos = entry.photos;
    if (!photos?.length) return entry;
    return {
      ...entry,
      photos: photos.map((p) => {
        if (typeof p !== "string") return p;
        return urlMap.get(p.trim()) || p;
      }),
    };
  });
}
