import OpenAI, { toFile } from "openai";
import { getWhisperModel } from "../aiModels";
import { SttError, type SpeechToTextProvider, type SttRequest, type SttResult } from "./types";

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });
}

function resolveLanguage(req: SttRequest): string | undefined {
  const raw = (req.language || process.env.STT_LANGUAGE || "en").trim().toLowerCase();
  if (!raw || raw === "auto") return undefined; // omit → Whisper auto-detect
  return raw;
}

/**
 * Existing Inspect360 provider: OpenAI Whisper API.
 * Sends audio to OpenAI (external). Keep as default until self-hosted is approved.
 */
export class OpenAIWhisperProvider implements SpeechToTextProvider {
  readonly name = "openai";

  async transcribe(req: SttRequest): Promise<SttResult> {
    if (!req.buffer?.length) {
      throw new SttError("Audio buffer is empty", "invalid_audio");
    }
    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      throw new SttError("OpenAI API key is not configured", "unavailable");
    }

    const model = getWhisperModel();
    const language = resolveLanguage(req);
    const file = await toFile(req.buffer, req.fileName || "audio.webm", {
      type: req.mimeType || "application/octet-stream",
    });

    try {
      const client = getOpenAIClient();
      const transcription = await client.audio.transcriptions.create({
        file,
        model,
        ...(language ? { language } : {}),
        response_format: "text",
      });
      const text =
        typeof transcription === "string"
          ? transcription
          : (transcription as { text?: string })?.text || String(transcription || "");
      const trimmed = text.trim();
      if (!trimmed) {
        throw new SttError("No transcription text received", "empty_result");
      }
      return { text: trimmed, provider: this.name, model };
    } catch (err) {
      if (err instanceof SttError) throw err;
      throw new SttError(
        err instanceof Error ? err.message : "OpenAI transcription failed",
        "provider_error",
        err,
      );
    }
  }
}
