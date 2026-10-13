import { spawn } from "child_process";

/** Convert arbitrary audio buffer to 16 kHz mono PCM WAV for whisper.cpp. */
export async function convertBufferToWav16kMono(inputBuffer: Buffer): Promise<Buffer> {
  const ffmpegPath = (await import("ffmpeg-static"))?.default;
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static is not available");
  }

  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "wav",
      "pipe:1",
    ];
    const proc = spawn(ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => errChunks.push(c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(errChunks).toString("utf8").slice(0, 400);
        return reject(new Error(`ffmpeg wav convert failed (exit ${code}): ${detail}`));
      }
      resolve(Buffer.concat(chunks));
    });
    proc.stdin.write(inputBuffer);
    proc.stdin.end();
  });
}
