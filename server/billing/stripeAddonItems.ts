import { getUncachableStripeClient } from "../stripeClient";

/** Resolve or create a Stripe price for an addon lookup key. */
export async function resolveAddonStripePrice(input: {
  lookupKey: string;
  name: string;
  amountMinor: number;
  cycle: "monthly" | "yearly";
}): Promise<string> {
  const stripe = await getUncachableStripeClient();
  const existing = await stripe.prices.list({ lookup_keys: [input.lookupKey], limit: 1 });
  if (existing.data[0]?.id) return existing.data[0].id;

  const product = await stripe.products.create({
    name: input.name,
    metadata: { lookupKey: input.lookupKey },
  });
  const created = await stripe.prices.create({
    product: product.id,
    currency: "gbp",
    unit_amount: input.amountMinor,
    recurring: { interval: input.cycle === "yearly" ? "year" : "month" },
    lookup_key: input.lookupKey,
    tax_behavior: "exclusive",
  });
  return created.id;
}

/**
 * Set quantity of a recurring addon item on a Stripe subscription.
 * Creates the item if missing; deletes when quantity is 0.
 */
export async function setSubscriptionAddonQuantity(input: {
  stripeSubscriptionId: string;
  lookupKey: string;
  name: string;
  amountMinor: number;
  cycle: "monthly" | "yearly";
  quantity: number;
  metadata?: Record<string, string>;
}): Promise<void> {
  const stripe = await getUncachableStripeClient();
  const priceId = await resolveAddonStripePrice({
    lookupKey: input.lookupKey,
    name: input.name,
    amountMinor: input.amountMinor,
    cycle: input.cycle,
  });

  const sub = await stripe.subscriptions.retrieve(input.stripeSubscriptionId, {
    expand: ["items.data.price"],
  });
  const item = sub.items.data.find(
    (i) =>
      i.price?.lookup_key === input.lookupKey ||
      i.price?.id === priceId ||
      i.price?.metadata?.lookupKey === input.lookupKey,
  );

  if (input.quantity <= 0) {
    if (item) {
      await stripe.subscriptionItems.del(item.id, {
        proration_behavior: "create_prorations",
      } as any);
    }
    return;
  }

  if (item) {
    await stripe.subscriptionItems.update(item.id, {
      quantity: input.quantity,
      proration_behavior: "always_invoice",
      metadata: input.metadata,
    });
    return;
  }

  await stripe.subscriptionItems.create({
    subscription: input.stripeSubscriptionId,
    price: priceId,
    quantity: input.quantity,
    proration_behavior: "always_invoice",
    metadata: input.metadata,
  });
}
