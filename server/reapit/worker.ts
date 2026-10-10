import { finishJob, claimNextJob } from "./repository";
import { ReapitApiError } from "./client";
import { handleWebhookTopic, runFullSync } from "./sync";
import { markWebhookEvent } from "./repository";

const MAX_ATTEMPTS = 8;

export async function processOneReapitJob(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;
  try {
    const payload = (job.payloadJson || {}) as Record<string, any>;
    if (job.kind === "full_sync") {
      if (!job.organizationId || !payload.runId) throw new Error("full_sync missing organisation or runId");
      await runFullSync(job.organizationId, payload.runId);
    } else if (job.kind === "webhook") {
      await handleWebhookTopic(payload.topicId, payload.customerId, payload.entityId);
      if (payload.eventId) await markWebhookEvent(payload.eventId, "processed");
    } else {
      throw new Error(`Unknown job kind ${job.kind}`);
    }
    await finishJob(job.id, "done");
  } catch (error: any) {
    const retryable = error instanceof ReapitApiError ? error.retryable : job.attempts < MAX_ATTEMPTS;
    const delay = Math.min(30000, 1000 * 2 ** Math.max(0, job.attempts - 1));
    if (retryable && job.attempts < MAX_ATTEMPTS) {
      await finishJob(job.id, "queued", error.message, new Date(Date.now() + delay));
    } else {
      await finishJob(job.id, "failed", error.message);
      const payload = (job.payloadJson || {}) as Record<string, any>;
      if (payload.eventId) await markWebhookEvent(payload.eventId, "failed", error.message);
    }
    console.error("[Reapit] Job failed:", job.kind, error.message);
  }
  return true;
}

export function startReapitWorker() {
  if (process.env.ENABLE_REAPIT_WORKER === "false") {
    console.log("ℹ️ Reapit worker is OFF (ENABLE_REAPIT_WORKER=false)");
    return;
  }
  const tick = async () => {
    try {
      let processed = 0;
      while (processed < 5 && (await processOneReapitJob())) processed += 1;
    } catch (error: any) {
      console.error("[Reapit] Worker tick failed:", error.message);
    }
  };
  setImmediate(tick);
  setInterval(tick, 5000);
  console.log("✅ Reapit worker initialized (every 5s)");
}
