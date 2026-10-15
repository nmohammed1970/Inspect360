export const REPORT_SECTION_IDS = [
  "cover",
  "contents",
  "floorPlan",
  "tradeMarks",
  "glossary",
  "maintenanceLog",
  "inspection",
  "inventory",
  "termsConditions",
  "closing",
] as const;

export type ReportSectionId = (typeof REPORT_SECTION_IDS)[number];

export const DEFAULT_REPORT_SECTION_ORDER: ReportSectionId[] = [...REPORT_SECTION_IDS];

export const REPORT_SECTION_META: Record<
  ReportSectionId,
  {
    label: string;
    showKey:
      | "showCover"
      | "showContentsPage"
      | "showFloorPlan"
      | "showTradeMarks"
      | "showGlossary"
      | "showMaintenanceLog"
      | "showInspection"
      | "showInventory"
      | "showTermsConditions"
      | "showClosingSection";
    testId: string;
  }
> = {
  cover: { label: "Cover Page", showKey: "showCover", testId: "switch-report-cover" },
  contents: { label: "Contents Page", showKey: "showContentsPage", testId: "switch-report-contents" },
  floorPlan: { label: "Floor Plan", showKey: "showFloorPlan", testId: "switch-report-floor-plan" },
  tradeMarks: { label: "Trade Marks", showKey: "showTradeMarks", testId: "switch-report-trademarks" },
  glossary: { label: "Glossary of Terms", showKey: "showGlossary", testId: "switch-report-glossary" },
  maintenanceLog: {
    label: "Maintenance Log",
    showKey: "showMaintenanceLog",
    testId: "switch-report-maintenance",
  },
  inspection: { label: "Inspection", showKey: "showInspection", testId: "switch-report-inspection" },
  inventory: { label: "Inventory", showKey: "showInventory", testId: "switch-report-inventory" },
  termsConditions: {
    label: "Terms and Conditions",
    showKey: "showTermsConditions",
    testId: "switch-report-terms",
  },
  closing: { label: "Closing Section", showKey: "showClosingSection", testId: "switch-report-closing" },
};

const REPORT_SECTION_ID_SET = new Set<string>(REPORT_SECTION_IDS);

export function isReportSectionId(value: string): value is ReportSectionId {
  return REPORT_SECTION_ID_SET.has(value);
}

/**
 * Merge saved order with defaults so new section ids are always included.
 * Missing ids are inserted after the latest saved section that precedes them
 * in the default order (so floorPlan lands after contents when both exist).
 */
export function normalizeReportSectionOrder(order?: string[] | null): ReportSectionId[] {
  if (!order || order.length === 0) {
    return [...DEFAULT_REPORT_SECTION_ORDER];
  }

  const result: ReportSectionId[] = [];
  const seen = new Set<ReportSectionId>();
  for (const raw of order) {
    if (!isReportSectionId(raw) || seen.has(raw)) continue;
    seen.add(raw);
    result.push(raw);
  }

  for (const id of REPORT_SECTION_IDS) {
    if (seen.has(id)) continue;

    const defaultIndex = REPORT_SECTION_IDS.indexOf(id);
    let insertAt = result.length;
    let bestPredPos = -1;

    for (let pos = 0; pos < result.length; pos++) {
      const existingDefaultIdx = REPORT_SECTION_IDS.indexOf(result[pos]!);
      if (existingDefaultIdx < defaultIndex && pos >= bestPredPos) {
        bestPredPos = pos;
        insertAt = pos + 1;
      }
    }

    if (bestPredPos === -1) {
      for (let pos = 0; pos < result.length; pos++) {
        const existingDefaultIdx = REPORT_SECTION_IDS.indexOf(result[pos]!);
        if (existingDefaultIdx > defaultIndex) {
          insertAt = pos;
          break;
        }
      }
    }

    result.splice(insertAt, 0, id);
    seen.add(id);
  }

  return result;
}
