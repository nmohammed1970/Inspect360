/** Speech-to-text provider interface (OpenAI Whisper or self-hosted). */

export type SttRequest = {
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  /** BCP-47-ish code: en, ur, or "auto". Overrides STT_LANGUAGE when set. */
  language?: string;
};

export type SttResult = {
  text: string;
  provider: string;
  model: string;
};

export interface SpeechToTextProvider {
  readonly name: string;
  transcribe(req: SttRequest): Promise<SttResult>;
}

export class SttError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "unavailable"
      | "timeout"
      | "invalid_audio"
      | "empty_result"
      | "provider_error",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SttError";
  }
}
