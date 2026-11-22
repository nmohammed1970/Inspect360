/** Trigger a browser download from a PDF API response. */
export async function downloadPdfFromUrl(
  url: string,
  fallbackFilename: string,
  options?: { credentials?: RequestCredentials },
): Promise<void> {
  const res = await fetch(url, {
    credentials: options?.credentials ?? "include",
  });
  if (!res.ok) {
    let message = "Failed to download PDF";
    try {
      const body = await res.json();
      message = body.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || fallbackFilename;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}
