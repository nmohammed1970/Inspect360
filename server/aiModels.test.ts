/**
 * AI model env helpers.
 * Run: npx tsx server/aiModels.test.ts
 */
import {
  getChatMiniModel,
  getChatModel,
  getImageModel,
  getInspectionModel,
  getWhisperModel,
} from "./aiModels";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

delete process.env.AI_INSPECTION_MODEL;
delete process.env.AI_CHAT_MODEL;
delete process.env.AI_CHAT_MINI_MODEL;
delete process.env.AI_WHISPER_MODEL;
delete process.env.AI_IMAGE_MODEL;

assert(getInspectionModel() === "gpt-5", "default inspection model");
assert(getChatModel() === "gpt-4o", "default chat model");
assert(getChatMiniModel() === "gpt-4o-mini", "default mini model");
assert(getWhisperModel() === "whisper-1", "default whisper model");
assert(getImageModel() === "dall-e-3", "default image model");

process.env.AI_INSPECTION_MODEL = "gpt-4o";
assert(getInspectionModel() === "gpt-4o", "env override inspection");

process.env.AI_INSPECTION_MODEL = "  gpt-5.6-terra  ";
assert(getInspectionModel() === "gpt-5.6-terra", "trim env value");

process.env.AI_INSPECTION_MODEL = "";
let threw = false;
try {
  getInspectionModel();
} catch (error: any) {
  threw = true;
  assert(String(error.message).includes("AI_INSPECTION_MODEL"), "empty env names variable");
}
assert(threw, "empty env throws");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
