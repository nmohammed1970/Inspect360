/**
 * Ivy-assisted triage — suggestions only; never auto-apply or auto-send.
 */

export type AiTriageSuggestion = {
  categoryKey: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  summary: string;
  intents: string[];
  suggestedTeamKey: string | null;
  suggestedActions: string[];
  draftReply: string;
  confidence: number;
  riskFlags: string[];
  multiIntentSuggestSecondCase: boolean;
  model: string;
  generatedAt: string;
};

const SAFETY_KEYWORDS = [
  "gas leak",
  "smell of gas",
  "carbon monoxide",
  "co alarm",
  "fire",
  "smoke",
  "flood",
  "flooding",
  "electrical spark",
  "exposed wire",
  "asbestos",
  "collapse",
  "no heating" /* winter emergency heuristic */,
  "no hot water",
  "broken lock",
  "can't get in",
  "cannot get in",
  "intruder",
  "break-in",
  "break in",
];

export function detectSafetyKeywords(text: string): string[] {
  const lower = (text || "").toLowerCase();
  return SAFETY_KEYWORDS.filter((kw) => lower.includes(kw));
}

/** Rule-based triage fallback when AI is unavailable. */
export function ruleBasedTriage(input: {
  subject: string;
  body: string;
  shortcut?: string | null;
}): AiTriageSuggestion {
  const text = `${input.subject}\n${input.body}`.toLowerCase();
  const safety = detectSafetyKeywords(text);
  const riskFlags = safety.map((s) => `safety:${s}`);

  let categoryKey: string | null = input.shortcut || null;
  let priority: AiTriageSuggestion["priority"] = "medium";
  let intents: string[] = ["general_enquiry"];
  let confidence = 0.55;

  if (safety.length) {
    categoryKey = "health_safety";
    priority = "urgent";
    intents = ["health_safety"];
    confidence = 0.95;
    riskFlags.push("requires_human_triage");
  } else if (
    input.shortcut === "maintenance" ||
    /\b(repair|broken|leak|boiler|heating|plumber|electrician|damp|mould|mold)\b/.test(text)
  ) {
    categoryKey = "maintenance";
    priority = /\burgent|emergency|asap\b/.test(text) ? "high" : "medium";
    intents = ["maintenance_repair"];
    confidence = 0.7;
  } else if (/\b(rent|arrears|payment|direct debit|invoice)\b/.test(text)) {
    categoryKey = "rent_payments";
    intents = ["rent_payment"];
    confidence = 0.65;
  } else if (/\b(tenancy|notice|evict|deposit|ast|lease)\b/.test(text)) {
    categoryKey = "tenancy";
    intents = ["tenancy"];
    confidence = 0.65;
  } else if (/\b(complaint|unhappy|dissatisfied)\b/.test(text)) {
    categoryKey = "complaints";
    priority = "high";
    intents = ["complaint"];
    confidence = 0.6;
  } else if (/\b(access|keys|key safe|viewing)\b/.test(text)) {
    categoryKey = "access";
    intents = ["access"];
    confidence = 0.6;
  } else if (/\b(move[- ]?in)\b/.test(text)) {
    categoryKey = "move_in";
    intents = ["move_in"];
  } else if (/\b(move[- ]?out)\b/.test(text)) {
    categoryKey = "move_out";
    intents = ["move_out"];
  } else if (/\b(inspection)\b/.test(text)) {
    categoryKey = "inspections";
    intents = ["inspection"];
  }

  const multiIntent =
    intents.includes("maintenance_repair") &&
    (/\b(rent|tenancy)\b/.test(text) || intents.length > 1);

  const draftReply = safety.length
    ? "Thank you for contacting us. This looks like it may need urgent attention. If anyone is in immediate danger, please call the emergency services. A member of our team will review this shortly."
    : "Thank you for your message. We have received your request and a member of the team will review it shortly.";

  return {
    categoryKey,
    priority,
    summary: (input.subject || input.body).slice(0, 200),
    intents,
    suggestedTeamKey: categoryKey === "maintenance" ? "maintenance" : null,
    suggestedActions: safety.length
      ? ["Escalate to on-call", "Confirm safety guidance sent"]
      : ["Acknowledge tenant", "Assign owner"],
    draftReply,
    confidence,
    riskFlags,
    multiIntentSuggestSecondCase: multiIntent,
    model: "rules-v1",
    generatedAt: new Date().toISOString(),
  };
}

/** Generate triage suggestion (rules now; swap for Ivy model later). */
export async function generateTriageSuggestion(input: {
  subject: string;
  body: string;
  shortcut?: string | null;
}): Promise<AiTriageSuggestion> {
  // Safety keywords always run independently of any model.
  return ruleBasedTriage(input);
}

export function shouldForceHumanTriage(suggestion: AiTriageSuggestion): boolean {
  if (suggestion.confidence < 0.6) return true;
  if (suggestion.riskFlags.some((f) => f.startsWith("safety:"))) return true;
  if (["rent_payments", "tenancy", "health_safety"].includes(suggestion.categoryKey || "")) {
    return true;
  }
  return false;
}
