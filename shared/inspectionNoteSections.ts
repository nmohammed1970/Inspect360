/**
 * Parse inspection AI/manual notes into description, maintenance issues,
 * and recommended actions for Capture, Report, and PDF display.
 */

export type InspectionNoteSections = {
  description: string;
  maintenanceIssues: string;
  recommendedActions: string;
};

const SECTION_HEADERS = {
  description: /^description\s*:?\s*$/i,
  maintenance: /^(maintenance\s+issues?|issues?)\s*:?\s*$/i,
  recommended: /^(recommended\s+actions?|recommendations?|actions?)\s*:?\s*$/i,
} as const;

const NONE_RE = /^(none|n\/a|na|no issues?|no recommendations?|nil)[\s.]*$/i;

const MAINTENANCE_HINT =
  /\b(damage|damaged|defect|defective|worn|wear|crack|cracked|stain|stained|deteriorat|broken|leak|rust|scuff|scuffing|chip|chipped|dent|scratch|peel|peeling|rot|mould|mold|issue|fault|failing|missing|loose)\b/i;

const RECOMMENDED_HINT =
  /\b(recommend|recommended|recommendation|should|advise|advised|suggest|suggested|consider|clean(?:ing)?|sand(?:ing)?|prim(?:e|ing)|repaint|repainting|replace|replacement|repair|routine maintenance|touch[- ]?up|seal|reseal)\b/i;

function normalizeNone(text: string): string {
  const t = text.trim();
  if (!t || NONE_RE.test(t)) return "";
  return t;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Labeled section format (preferred for new AI output). */
function parseLabeled(note: string): InspectionNoteSections | null {
  const lines = note.replace(/\r\n/g, "\n").split("\n");
  let current: keyof InspectionNoteSections | null = null;
  const buckets: InspectionNoteSections = {
    description: "",
    maintenanceIssues: "",
    recommendedActions: "",
  };
  let foundHeader = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (current) buckets[current] += "\n";
      continue;
    }

    if (SECTION_HEADERS.description.test(line)) {
      current = "description";
      foundHeader = true;
      continue;
    }
    if (SECTION_HEADERS.maintenance.test(line)) {
      current = "maintenanceIssues";
      foundHeader = true;
      continue;
    }
    if (SECTION_HEADERS.recommended.test(line)) {
      current = "recommendedActions";
      foundHeader = true;
      continue;
    }

    // Inline "LABEL: content" on one line
    const inline = line.match(
      /^(description|maintenance\s+issues?|issues?|recommended\s+actions?|recommendations?|actions?)\s*:\s*(.+)$/i,
    );
    if (inline) {
      foundHeader = true;
      const label = inline[1].toLowerCase();
      const content = inline[2];
      if (label.startsWith("description")) {
        current = "description";
        buckets.description += (buckets.description ? " " : "") + content;
      } else if (label.startsWith("maintenance") || label.startsWith("issue")) {
        current = "maintenanceIssues";
        buckets.maintenanceIssues += (buckets.maintenanceIssues ? " " : "") + content;
      } else {
        current = "recommendedActions";
        buckets.recommendedActions += (buckets.recommendedActions ? " " : "") + content;
      }
      continue;
    }

    if (current) {
      buckets[current] += (buckets[current].endsWith("\n") || !buckets[current] ? "" : " ") + line;
    } else {
      buckets.description += (buckets.description ? " " : "") + line;
    }
  }

  if (!foundHeader) return null;

  return {
    description: normalizeNone(buckets.description.replace(/\n+/g, " ").trim()),
    maintenanceIssues: normalizeNone(buckets.maintenanceIssues.replace(/\n+/g, " ").trim()),
    recommendedActions: normalizeNone(buckets.recommendedActions.replace(/\n+/g, " ").trim()),
  };
}

/** Heuristic split for legacy single-paragraph AI notes. */
function parseHeuristic(note: string): InspectionNoteSections {
  const sentences = splitSentences(note.trim());
  if (sentences.length <= 1) {
    return { description: note.trim(), maintenanceIssues: "", recommendedActions: "" };
  }

  const description: string[] = [];
  const maintenance: string[] = [];
  const recommended: string[] = [];

  for (const sentence of sentences) {
    const isRec = RECOMMENDED_HINT.test(sentence);
    const isMaint = MAINTENANCE_HINT.test(sentence);
    if (isRec && !isMaint) {
      recommended.push(sentence);
    } else if (isMaint && !isRec) {
      maintenance.push(sentence);
    } else if (isRec && isMaint) {
      // Prefer recommended for "recommend repairing X damage" style
      if (/\brecommend|\bshould\b|\bsuggest/i.test(sentence)) {
        recommended.push(sentence);
      } else {
        maintenance.push(sentence);
      }
    } else {
      description.push(sentence);
    }
  }

  // If everything was classified away from description, keep first sentence as description
  if (!description.length && (maintenance.length || recommended.length)) {
    const first = sentences[0];
    if (maintenance[0] === first) maintenance.shift();
    else if (recommended[0] === first) recommended.shift();
    description.push(first);
  }

  return {
    description: description.join(" ").trim(),
    maintenanceIssues: maintenance.join(" ").trim(),
    recommendedActions: recommended.join(" ").trim(),
  };
}

export function parseInspectionNote(note: string | null | undefined): InspectionNoteSections {
  const raw = (note || "").trim();
  if (!raw) {
    return { description: "", maintenanceIssues: "", recommendedActions: "" };
  }

  const labeled = parseLabeled(raw);
  if (labeled) return labeled;
  return parseHeuristic(raw);
}

export function hasNoteSections(sections: InspectionNoteSections): boolean {
  return Boolean(
    sections.description || sections.maintenanceIssues || sections.recommendedActions,
  );
}

/** True when the note uses DESCRIPTION / MAINTENANCE / RECOMMENDED headers. */
export function isLabeledInspectionNote(note: string | null | undefined): boolean {
  return parseLabeled((note || "").trim()) !== null;
}

/** Rebuild a labeled note from sections (for editable description in Capture). */
export function formatInspectionNote(sections: InspectionNoteSections): string {
  const desc = sections.description.trim() || "None";
  const maint = sections.maintenanceIssues.trim() || "None";
  const rec = sections.recommendedActions.trim() || "None";
  return `DESCRIPTION:\n${desc}\n\nMAINTENANCE ISSUES:\n${maint}\n\nRECOMMENDED ACTIONS:\n${rec}`;
}

/**
 * Seed a maintenance request description from an inspection field note.
 * Prefers AI structured sections (description + recommended actions, plus issues).
 * Falls back to plain notes; always includes a short field/section preamble when available.
 */
export function buildMaintenanceRequestDescription(opts: {
  fieldLabel?: string | null;
  sectionTitle?: string | null;
  note?: string | null;
}): string {
  const fieldLabel = (opts.fieldLabel || "").trim();
  const sectionTitle = (opts.sectionTitle || "").trim();
  const sectionInfo = sectionTitle ? ` in ${sectionTitle}` : "";
  const preamble = fieldLabel
    ? `Maintenance request created from inspection field: ${fieldLabel}${sectionInfo}`
    : "";

  const rawNote = (opts.note || "").trim();
  if (!rawNote) return preamble;

  const sections = parseInspectionNote(rawNote);
  const desc = normalizeNone(sections.description);
  const maint = normalizeNone(sections.maintenanceIssues);
  const rec = normalizeNone(sections.recommendedActions);

  const bodyParts: string[] = [];
  if (desc) bodyParts.push(`Description:\n${desc}`);
  if (maint) bodyParts.push(`Maintenance Issues:\n${maint}`);
  if (rec) bodyParts.push(`Recommended Actions:\n${rec}`);

  // Labeled/heuristic produced nothing useful → keep raw note (e.g. voice comments only)
  if (bodyParts.length === 0) {
    bodyParts.push(rawNote);
  }

  if (preamble) return `${preamble}\n\n${bodyParts.join("\n\n")}`;
  return bodyParts.join("\n\n");
}

/**
 * Language rule for all inspection / comparison / maintenance AI report text.
 * Instances are UK-based — force British English spelling and property terminology.
 */
export const UK_ENGLISH_REPORTING_PROMPT = `LANGUAGE (mandatory): Write all narrative text in British English (UK spelling and terminology).
Use UK forms such as: colour/discolouration, localised, centre, favour, metre, mould (not mold), skirting board (not baseboard), tap (not faucet), communal (prefer over common area when appropriate).
Do not use American spellings (e.g. color, discoloration, localized, center, favor, meter for length, mold for fungi, baseboard, faucet).`;

/** Full three-section note prompt (includes Recommended Actions). */
export const INSPECTION_NOTE_STRUCTURE_PROMPT = `${UK_ENGLISH_REPORTING_PROMPT}

Structure your response EXACTLY in these three labeled sections (plain text, no markdown, no bullets, no emojis):

DESCRIPTION:
[Factual condition and cleanliness assessment only]

MAINTENANCE ISSUES:
[Visible damage, defects, or problems that need attention — or write None]

RECOMMENDED ACTIONS:
[Brief actionable recommendations — or write None]

Do not write anything outside these three sections.`;

/** Two-section note prompt used when template has Recommended Actions disabled. */
export const INSPECTION_NOTE_STRUCTURE_PROMPT_NO_RECOMMENDED = `${UK_ENGLISH_REPORTING_PROMPT}

Structure your response EXACTLY in these two labeled sections (plain text, no markdown, no bullets, no emojis):

DESCRIPTION:
[Factual condition and cleanliness assessment only]

MAINTENANCE ISSUES:
[Visible damage, defects, or problems that need attention — or write None]

Do NOT include a RECOMMENDED ACTIONS section, recommendations, advice, or next steps.
Do not write anything outside these two sections.`;

/** Build InspectAI note structure prompt from template setting (default: no recommended actions). */
export function buildInspectionNoteStructurePrompt(includeRecommendedActions?: boolean | null): string {
  return includeRecommendedActions === true
    ? INSPECTION_NOTE_STRUCTURE_PROMPT
    : INSPECTION_NOTE_STRUCTURE_PROMPT_NO_RECOMMENDED;
}

/** Read snapshot/template flag; missing/undefined = disabled. */
export function resolveAiIncludeRecommendedActions(
  source: { aiIncludeRecommendedActions?: boolean | null } | null | undefined,
): boolean {
  return source?.aiIncludeRecommendedActions === true;
}

/** Drop recommended-actions content from a stored note (when template setting is off). */
export function stripRecommendedActionsFromNote(note: string | null | undefined): string {
  const raw = (note || "").trim();
  if (!raw) return "";
  const sections = parseInspectionNote(raw);
  // Persist two-section format only — no RECOMMENDED ACTIONS header.
  const desc = sections.description.trim() || "None";
  const maint = sections.maintenanceIssues.trim() || "None";
  if (!sections.recommendedActions && !/recommended\s+actions?/i.test(raw)) {
    return raw;
  }
  return `DESCRIPTION:\n${desc}\n\nMAINTENANCE ISSUES:\n${maint}`;
}

/**
 * Attach AI meta flags onto a template structure snapshot so inspections keep
 * the setting even if the live template later changes.
 */
export function withTemplateAiMeta(
  structureJson: unknown,
  template: { aiIncludeRecommendedActions?: boolean | null } | null | undefined,
): Record<string, unknown> {
  const base =
    structureJson && typeof structureJson === "object" && !Array.isArray(structureJson)
      ? { ...(structureJson as Record<string, unknown>) }
      : { sections: [] };
  return {
    ...base,
    aiIncludeRecommendedActions: resolveAiIncludeRecommendedActions(template),
  };
}
