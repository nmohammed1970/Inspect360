/** Sanitize a string for use in download filenames. */
function sanitizeFilenamePart(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_") || "inspection"
  );
}

function formatPdfDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Build inspection PDF filename: Location_Date_InspectorName.pdf
 * Omits inspector/contractor when not assigned (or unknown).
 */
export function buildInspectionPdfFilename(options: {
  locationName?: string | null;
  date?: Date | string | null;
  inspectorName?: string | null;
}): string {
  const location = sanitizeFilenamePart(options.locationName || "inspection");
  const parts = [location];

  const datePart = formatPdfDate(options.date);
  if (datePart) {
    parts.push(datePart);
  }

  const inspector = options.inspectorName?.trim();
  if (inspector && !/^unknown\b/i.test(inspector)) {
    parts.push(sanitizeFilenamePart(inspector));
  }

  return `${parts.join("_")}.pdf`;
}
