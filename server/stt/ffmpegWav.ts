import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { repairIosM4aBuffer } from "./repairIosM4a";

/**
 * Convert arbitrary audio buffer to 16 kHz mono PCM WAV for whisper.cpp.
 * Uses a temp input file (WebM/Matroska from MediaRecorder is often not seekable via pipe).
 */
export async function convertBufferToWav16kMono(inputBuffer: Buffer): Promise<Buffer> {
  const ffmpegPath = (await import("ffmpeg-static"))?.default;
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static is not available");
  }
  if (!inputBuffer?.length) {
    throw new Error("Audio buffer is empty");
  }

  const repaired = repairIosM4aBuffer(inputBuffer);
  const work = repaired.buffer;

  const inputPath = path.join(os.tmpdir(), `stt-in-${randomUUID()}.bin`);
  const outputPath = path.join(os.tmpdir(), `stt-out-${randomUUID()}.wav`);
  await fs.writeFile(inputPath, work);

  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-err_detect",
        "ignore_err",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        "-y",
        outputPath,
      ];
      const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
      const errChunks: Buffer[] = [];
      proc.stderr.on("data", (c: Buffer) => errChunks.push(c));
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code !== 0) {
          const detail = Buffer.concat(errChunks).toString("utf8").slice(0, 400);
          return reject(new Error(`ffmpeg wav convert failed (exit ${code}): ${detail}`));
        }
        resolve();
      });
    });
    const wav = await fs.readFile(outputPath);
    if (!wav.length) {
      throw new Error("ffmpeg produced empty WAV");
    }
    return wav;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}
