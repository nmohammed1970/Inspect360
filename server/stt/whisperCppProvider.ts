import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { convertBufferToWav16kMono } from "./ffmpegWav";
import { SttError, type SpeechToTextProvider, type SttRequest, type SttResult } from "./types";

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function resolveLanguage(req: SttRequest): string {
  return (req.language || process.env.STT_LANGUAGE || "en").trim().toLowerCase() || "en";
}

/**
 * Self-hosted whisper.cpp CLI provider.
 * Does not send audio to external services.
 *
 * Requires:
 *   WHISPER_CPP_BIN   — path to whisper-cli (or compatible binary)
 *   WHISPER_CPP_MODEL — path to ggml/gguf model (use multilingual, not *.en, for Urdu)
 */
export class WhisperCppProvider implements SpeechToTextProvider {
  readonly name = "whisper_cpp";

  async transcribe(req: SttRequest): Promise<SttResult> {
    if (!req.buffer?.length) {
      throw new SttError("Audio buffer is empty", "invalid_audio");
    }

    const bin = (process.env.WHISPER_CPP_BIN || "").trim();
    const model = (process.env.WHISPER_CPP_MODEL || "").trim();
    if (!bin || !model) {
      throw new SttError(
        "whisper.cpp is not configured (set WHISPER_CPP_BIN and WHISPER_CPP_MODEL)",
        "unavailable",
      );
    }

    try {
      await fs.access(bin);
      await fs.access(model);
    } catch {
      throw new SttError(
        "whisper.cpp binary or model file is missing on this host",
        "unavailable",
      );
    }

    const timeoutMs = envInt("STT_TIMEOUT_MS", 120_000);
    const threads = envInt("WHISPER_CPP_THREADS", 4);
    const language = resolveLanguage(req);

    const tmpDir = os.tmpdir();
    const id = randomUUID();
    const wavPath = path.join(tmpDir, `stt-${id}.wav`);
    const outBase = path.join(tmpDir, `stt-${id}`);

    try {
      const wav = await convertBufferToWav16kMono(req.buffer);
      if (wav.length < 44) {
        throw new SttError("Converted audio is invalid or empty", "invalid_audio");
      }
      await fs.writeFile(wavPath, wav);

      const args = [
        "-m",
        model,
        "-f",
        wavPath,
        "-t",
        String(threads),
        "-nt",
        "-np",
        "-of",
        outBase,
        "-otxt",
      ];
      if (language && language !== "auto") {
        args.push("-l", language);
      } else {
        args.push("-l", "auto");
      }

      const stdout = await spawnCapture(bin, args, timeoutMs);
      const txtPath = `${outBase}.txt`;
      let text = "";
      try {
        text = (await fs.readFile(txtPath, "utf8")).trim();
      } catch {
        text = stdout.trim();
      }

      // whisper.cpp often prefixes lines with timestamps even with -nt; strip common junk
      text = text
        .replace(/^\s*\[\d+:\d+\.\d+\s*-->\s*\d+:\d+\.\d+\]\s*/gm, "")
        .replace(/\r/g, "")
        .trim();

      if (!text) {
        throw new SttError("No transcription text received from whisper.cpp", "empty_result");
      }

      return { text, provider: this.name, model: path.basename(model) };
    } catch (err) {
      if (err instanceof SttError) throw err;
      if (err && typeof err === "object" && (err as any).code === "TIMEOUT") {
        throw new SttError("Speech-to-text timed out", "timeout", err);
      }
      throw new SttError(
        err instanceof Error ? err.message : "whisper.cpp transcription failed",
        "provider_error",
        err,
      );
    } finally {
      await fs.unlink(wavPath).catch(() => {});
      await fs.unlink(`${outBase}.txt`).catch(() => {});
    }
  }
}

function spawnCapture(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill("SIGKILL");
      const e = new Error(`whisper.cpp exceeded ${timeoutMs}ms`);
      (e as any).code = "TIMEOUT";
      reject(e);
    }, timeoutMs);

    proc.stdout.on("data", (c: Buffer) => out.push(c));
    proc.stderr.on("data", (c: Buffer) => err.push(c));
    proc.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const detail = Buffer.concat(err).toString("utf8").slice(0, 500);
        return reject(new Error(`whisper.cpp exited ${code}: ${detail}`));
      }
      resolve(Buffer.concat(out).toString("utf8"));
    });
  });
}
