import { OpenAIWhisperProvider } from "./openaiWhisperProvider";
import { WhisperCppProvider } from "./whisperCppProvider";
import { SttError, type SpeechToTextProvider, type SttRequest, type SttResult } from "./types";

export type { SttRequest, SttResult, SpeechToTextProvider } from "./types";
export { SttError } from "./types";

let testOverride: SpeechToTextProvider | null = null;

/** Test-only injection. */
export function setSttProviderForTests(provider: SpeechToTextProvider | null): void {
  testOverride = provider;
}

export function getConfiguredSttProviderName(): string {
  return (process.env.STT_PROVIDER || "openai").trim().toLowerCase() || "openai";
}

export function createSttProvider(name = getConfiguredSttProviderName()): SpeechToTextProvider {
  switch (name) {
    case "whisper_cpp":
    case "local":
      return new WhisperCppProvider();
    case "openai":
    default:
      return new OpenAIWhisperProvider();
  }
}

function fallbackEnabled(): boolean {
  const v = (process.env.STT_FALLBACK_OPENAI || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Run STT with the configured provider.
 * When primary is self-hosted and STT_FALLBACK_OPENAI=true, falls back to OpenAI on unavailable/timeout/provider_error.
 * Privacy-strict mode: leave STT_FALLBACK_OPENAI unset/false so audio never leaves the host.
 */
export async function runSpeechToText(req: SttRequest): Promise<SttResult> {
  const primary = testOverride || createSttProvider();
  try {
    return await primary.transcribe(req);
  } catch (err) {
    const canFallback =
      !testOverride &&
      primary.name !== "openai" &&
      fallbackEnabled() &&
      err instanceof SttError &&
      (err.code === "unavailable" || err.code === "timeout" || err.code === "provider_error");

    if (!canFallback) throw err;

    console.warn(
      `[STT] Provider ${primary.name} failed (${err.code}); falling back to OpenAI because STT_FALLBACK_OPENAI is enabled`,
    );
    return await new OpenAIWhisperProvider().transcribe(req);
  }
}
