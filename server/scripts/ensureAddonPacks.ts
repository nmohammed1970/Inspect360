/**
 * Ensure Billing Spec v2 top-up packs (20 / 50 / 100) exist in addon_pack_config.
 * Usage: npx tsx server/scripts/ensureAddonPacks.ts
 */
import "dotenv/config";
import { storage } from "../storage";

async function main() {
  const packs = await storage.ensureDefaultAddonPacks();
  console.log("Active addon packs:");
  for (const p of packs) {
    console.log(`  - ${p.name}: ${p.inspectionQuantity} inspections (order ${p.packOrder})`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
