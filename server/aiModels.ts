/**
 * OpenAI model ids from env so inspection/chat/whisper can be changed without code edits.
 * Empty env values fail clearly instead of calling an invalid blank model name.
 */

function readModel(envName: string, fallback: string): string {
  const raw = process.env[envName];
  if (raw === undefined || raw === null) return fallback;
  const value = String(raw).trim();
  if (!value) {
    throw new Error(
      `${envName} is set but empty. Set a valid model id (e.g. gpt-4o) or remove the variable to use the default (${fallback}).`,
    );
  }
  return value;
}

/** Vision / inspection write-up / photo analyse (was hardcoded gpt-5). */
export function getInspectionModel(): string {
  return readModel("AI_INSPECTION_MODEL", "gpt-5");
}

/** Chat, Ivy, maintenance analyse, certificates, comparison notes (was gpt-4o). */
export function getChatModel(): string {
  return readModel("AI_CHAT_MODEL", "gpt-4o");
}

/** Lightweight chat titles etc. (was gpt-4o-mini). */
export function getChatMiniModel(): string {
  return readModel("AI_CHAT_MINI_MODEL", "gpt-4o-mini");
}

/** Speech-to-text (was whisper-1). */
export function getWhisperModel(): string {
  return readModel("AI_WHISPER_MODEL", "whisper-1");
}

/** Image generation e.g. community banners (was dall-e-3). */
export function getImageModel(): string {
  return readModel("AI_IMAGE_MODEL", "dall-e-3");
}
