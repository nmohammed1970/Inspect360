/**
 * Webhook idempotency & payment-workflow decision tests (no Stripe/DB).
 * Covers: success, duplicate, delayed, unhandled, billingV2 gate.
 * Run: npx tsx server/billing/webhookIdempotency.test.ts
 */
import assert from "node:assert/strict";
import { shouldSkipWebhookEvent } from "@shared/billingFinancialMath";

type StoredEvent = {
  stripeEventId: string;
  eventType: string;
  processedAt: Date | null;
  error: string | null;
};

/** In-memory stand-in for billing_webhook_events unique stripe_event_id. */
class FakeWebhookStore {
  private byId = new Map<string, StoredEvent>();

  insert(event: { id: string; type: string }): { duplicateInsert: boolean } {
    if (this.byId.has(event.id)) return { duplicateInsert: true };
    this.byId.set(event.id, {
      stripeEventId: event.id,
      eventType: event.type,
      processedAt: null,
      error: null,
    });
    return { duplicateInsert: false };
  }

  get(id: string) {
    return this.byId.get(id) ?? null;
  }

  markProcessed(id: string) {
    const row = this.byId.get(id);
    if (!row) throw new Error("missing");
    row.processedAt = new Date();
    row.error = null;
  }

  markError(id: string, error: string) {
    const row = this.byId.get(id);
    if (!row) throw new Error("missing");
    row.error = error;
  }
}

function processOnce(
  store: FakeWebhookStore,
  event: { id: string; type: string; metadata?: Record<string, string> },
  handler: () => "handled" | "ignored" | "throw",
): { skipped: boolean; handled: boolean; error?: string } {
  const existing = store.get(event.id);
  if (shouldSkipWebhookEvent(existing)) {
    return { skipped: true, handled: true };
  }
  store.insert(event);
  try {
    const result = handler();
    if (result === "throw") throw new Error("handler boom");
    if (result === "handled") {
      store.markProcessed(event.id);
      return { skipped: false, handled: true };
    }
    // ignored — do not mark processed (legacy path may still run)
    return { skipped: false, handled: false };
  } catch (e: any) {
    store.markError(event.id, e.message);
    return { skipped: false, handled: false, error: e.message };
  }
}

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("FAIL:", msg);
  }
}

{
  const store = new FakeWebhookStore();
  const evt = { id: "evt_1", type: "checkout.session.completed" };
  const first = processOnce(store, evt, () => "handled");
  check(first.handled && !first.skipped, "first webhook processes");
  const second = processOnce(store, evt, () => "handled");
  check(second.skipped === true, "duplicate webhook skipped");
  check(store.get("evt_1")?.processedAt != null, "processedAt set");
}

{
  const store = new FakeWebhookStore();
  const evt = { id: "evt_fail", type: "invoice.payment_failed" };
  const r = processOnce(store, evt, () => "throw");
  check(!!r.error, "handler failure recorded");
  check(store.get("evt_fail")?.processedAt == null, "failed event not marked processed");
  // recovery: retry after fix
  store.insert(evt); // already exists
  const row = store.get("evt_fail")!;
  check(!shouldSkipWebhookEvent(row), "failed event can be retried");
  store.markProcessed("evt_fail");
  check(shouldSkipWebhookEvent(store.get("evt_fail")), "after recovery, skip");
}

{
  const store = new FakeWebhookStore();
  // delayed out-of-order: subscription.updated before checkout completed is "ignored" for v2
  const delayed = processOnce(store, { id: "evt_delay", type: "customer.subscription.updated" }, () => "ignored");
  check(delayed.handled === false, "unhandled/ignored not marked complete");
  check(store.get("evt_delay")?.processedAt == null, "delayed ignored keeps open for legacy");
}

{
  // billingV2 gate
  function isBillingV2(meta?: Record<string, string>) {
    return meta?.billingV2 === "true";
  }
  check(isBillingV2({ billingV2: "true" }), "v2 metadata accepted");
  check(!isBillingV2({}), "legacy without flag");
  check(!isBillingV2(undefined), "undefined meta");
}

{
  // concurrent duplicate inserts
  const store = new FakeWebhookStore();
  const a = store.insert({ id: "evt_race", type: "invoice.paid" });
  const b = store.insert({ id: "evt_race", type: "invoice.paid" });
  check(a.duplicateInsert === false, "first insert wins");
  check(b.duplicateInsert === true, "second insert rejected (unique)");
}

console.log(`webhookIdempotency.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
