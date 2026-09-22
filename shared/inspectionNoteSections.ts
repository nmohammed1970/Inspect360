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

/** Instruction block appended to InspectAI prompts for structured notes. */
export const INSPECTION_NOTE_STRUCTURE_PROMPT = `Structure your response EXACTLY in these three labeled sections (plain text, no markdown, no bullets, no emojis):

DESCRIPTION:
[Factual condition and cleanliness assessment only]

MAINTENANCE ISSUES:
[Visible damage, defects, or problems that need attention — or write None]

RECOMMENDED ACTIONS:
[Brief actionable recommendations — or write None]

Do not write anything outside these three sections.`;
