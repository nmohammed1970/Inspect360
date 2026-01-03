import "dotenv/config";
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import { db } from "./db";
import { 
  subscriptionTiersTable, 
  tierPricing, 
  addonPackConfig, 
  addonPackPricing,
  currencyConfig,
  adminUsers 
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { hashPassword } from "./auth";

async function seedEcoAdmin() {
  console.log("🌱 Seeding Eco Admin data...");

  try {
    // Ensure currencies exist first
    console.log("💱 Ensuring currencies exist...");
    const currencies = [
      { code: "GBP", symbol: "£", isActive: true, conversionRate: "1.0000" },
      { code: "USD", symbol: "$", isActive: true, conversionRate: "1.2700" },
      { code: "AED", symbol: "د.إ", isActive: true, conversionRate: "4.6500" },
    ];

    for (const currency of currencies) {
      const existing = await db.select().from(currencyConfig).where(eq(currencyConfig.code, currency.code)).limit(1);
      if (existing.length === 0) {
        await db.insert(currencyConfig).values(currency);
        console.log(`✅ Created currency: ${currency.code}`);
      } else {
        console.log(`⏭️  Currency ${currency.code} already exists, skipping`);
      }
    }

    // Seed Subscription Tiers (2026 Model)
    console.log("\n📦 Seeding subscription tiers...");
    
    const tierData = [
      {
        id: "626bee64-a380-4a5f-8377-fe864d083045",
        name: "Starter",
        code: "starter" as const,
        description: "Perfect for small property portfolios",
        tierOrder: 1,
        includedInspections: 10,
        basePriceMonthly: 4900, // £49/mo in pence
        basePriceAnnual: 49000, // £490/yr in pence
        annualDiscountPercentage: "16.70",
        isActive: true,
        requiresCustomPricing: false,
      },
      {
        id: "d0d7af4e-7d6f-46d8-9a5a-3adef9c9c220",
        name: "Growth",
        code: "growth" as const,
        description: "Ideal for growing property businesses",
        tierOrder: 2,
        includedInspections: 30,
        basePriceMonthly: 12900, // £129/mo in pence
        basePriceAnnual: 129000, // £1,290/yr in pence
        annualDiscountPercentage: "16.70",
        isActive: true,
        requiresCustomPricing: false,
      },
      {
        id: "b266846d-96b0-4e74-a2b4-03e307b28a08",
        name: "Professional",
        code: "professional" as const,
        description: "For established property management companies",
        tierOrder: 3,
        includedInspections: 75,
        basePriceMonthly: 29900, // £299/mo in pence
        basePriceAnnual: 299000, // £2,990/yr in pence
        annualDiscountPercentage: "16.70",
        isActive: true,
        requiresCustomPricing: false,
      },
      {
        id: "eda7e5ba-0f5e-4ed4-9215-67a91310becb",
        name: "Enterprise",
        code: "enterprise" as const,
        description: "For large-scale property operations",
        tierOrder: 4,
        includedInspections: 200,
        basePriceMonthly: 69900, // £699/mo in pence
        basePriceAnnual: 699000, // £6,990/yr in pence
        annualDiscountPercentage: "16.70",
        isActive: true,
        requiresCustomPricing: false,
      },
      {
        id: "6c79daec-9645-4fe8-baf1-5584ec5b8a17",
        name: "Enterprise Plus",
        code: "enterprise_plus" as const,
        description: "Custom pricing for enterprise clients",
        tierOrder: 5,
        includedInspections: 500,
        basePriceMonthly: 0, // Custom pricing
        basePriceAnnual: 0, // Custom pricing
        annualDiscountPercentage: "16.70",
        isActive: true,
        requiresCustomPricing: true,
      },
    ];

    const createdTiers: Array<{ id: string; code: string }> = [];

    for (const tier of tierData) {
      const existing = await db
        .select()
        .from(subscriptionTiersTable)
        .where(eq(subscriptionTiersTable.code, tier.code))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(subscriptionTiersTable).values(tier);
        console.log(`✅ Created tier: ${tier.name}`);
        createdTiers.push({ id: tier.id, code: tier.code });
      } else {
        console.log(`⏭️  Tier ${tier.name} already exists, skipping`);
        createdTiers.push({ id: existing[0].id, code: tier.code });
      }
    }

    // Seed Tier Pricing (Multi-currency)
    console.log("\n💰 Seeding tier pricing (multi-currency)...");
    
    const tierPricingData = [
      // Starter tier pricing
      { tierCode: "starter", gbp: { monthly: 4900, annual: 49000 }, usd: { monthly: 6125, annual: 61250 }, aed: { monthly: 22540, annual: 225400 } },
      // Growth tier pricing
      { tierCode: "growth", gbp: { monthly: 12900, annual: 129000 }, usd: { monthly: 16125, annual: 161250 }, aed: { monthly: 59340, annual: 593400 } },
      // Professional tier pricing
      { tierCode: "professional", gbp: { monthly: 29900, annual: 299000 }, usd: { monthly: 37375, annual: 373750 }, aed: { monthly: 137540, annual: 1375400 } },
      // Enterprise tier pricing
      { tierCode: "enterprise", gbp: { monthly: 69900, annual: 699000 }, usd: { monthly: 87375, annual: 873750 }, aed: { monthly: 321540, annual: 3215400 } },
      // Enterprise Plus (custom pricing - set to 0)
      { tierCode: "enterprise_plus", gbp: { monthly: 0, annual: 0 }, usd: { monthly: 0, annual: 0 }, aed: { monthly: 0, annual: 0 } },
    ];

    for (const pricing of tierPricingData) {
      const tier = createdTiers.find(t => t.code === pricing.tierCode);
      if (!tier) continue;

      for (const [currency, prices] of Object.entries({ GBP: pricing.gbp, USD: pricing.usd, AED: pricing.aed })) {
        const existing = await db
          .select()
          .from(tierPricing)
          .where(and(
            eq(tierPricing.tierId, tier.id),
            eq(tierPricing.currencyCode, currency)
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(tierPricing).values({
            tierId: tier.id,
            currencyCode: currency,
            priceMonthly: prices.monthly,
            priceAnnual: prices.annual,
          });
          console.log(`✅ Created ${currency} pricing for ${pricing.tierCode}`);
        } else {
          console.log(`⏭️  ${currency} pricing for ${pricing.tierCode} already exists, skipping`);
        }
      }
    }

    // Seed Add-On Pack Configuration
    console.log("\n📦 Seeding add-on pack configuration...");
    
    const addonPackData = [
      {
        id: "083d8cc3-c37e-48b5-a9be-4c6016f9d847",
        name: "20 Pack",
        inspectionQuantity: 20,
        packOrder: 1,
        isActive: true,
      },
      {
        id: "a80b5f94-577a-4eee-ad5d-3c0b2d0e5943",
        name: "50 Pack",
        inspectionQuantity: 50,
        packOrder: 2,
        isActive: true,
      },
      {
        id: "bebaf571-d683-4112-b8d3-f4c6b6318272",
        name: "100 Pack",
        inspectionQuantity: 100,
        packOrder: 3,
        isActive: true,
      },
    ];

    const createdPacks: Array<{ id: string; quantity: number }> = [];

    for (const pack of addonPackData) {
      const existing = await db
        .select()
        .from(addonPackConfig)
        .where(eq(addonPackConfig.inspectionQuantity, pack.inspectionQuantity))
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(addonPackConfig).values(pack);
        console.log(`✅ Created addon pack: ${pack.name}`);
        createdPacks.push({ id: pack.id, quantity: pack.inspectionQuantity });
      } else {
        console.log(`⏭️  Addon pack ${pack.name} already exists, skipping`);
        createdPacks.push({ id: existing[0].id, quantity: pack.inspectionQuantity });
      }
    }

    // Seed Add-On Pack Pricing (tier-based pricing)
    console.log("\n💳 Seeding add-on pack pricing (tier-based)...");
    
    // Pricing per inspection by tier (in pence/cents/fils)
    // Format: { tierCode: { gbp: pricePerInspection, usd: ..., aed: ... } }
    const addonPricingByTier: Record<string, { gbp: number; usd: number; aed: number }> = {
      starter: { gbp: 550, usd: 690, aed: 2540 },      // £5.50 per inspection
      growth: { gbp: 550, usd: 690, aed: 2540 },        // £5.50 per inspection
      professional: { gbp: 550, usd: 690, aed: 2540 },  // £5.50 per inspection
      enterprise: { gbp: 550, usd: 690, aed: 2540 },   // £5.50 per inspection
      enterprise_plus: { gbp: 550, usd: 690, aed: 2540 }, // £5.50 per inspection
    };

    for (const pack of createdPacks) {
      for (const tier of createdTiers) {
        const pricing = addonPricingByTier[tier.code];
        if (!pricing) continue;

        for (const [currency, pricePerInspection] of Object.entries({
          GBP: pricing.gbp,
          USD: pricing.usd,
          AED: pricing.aed,
        })) {
          const totalPackPrice = pricePerInspection * pack.quantity;

          const existing = await db
            .select()
            .from(addonPackPricing)
            .where(and(
              eq(addonPackPricing.packId, pack.id),
              eq(addonPackPricing.tierId, tier.id),
              eq(addonPackPricing.currencyCode, currency)
            ))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(addonPackPricing).values({
              packId: pack.id,
              tierId: tier.id,
              currencyCode: currency,
              pricePerInspection: pricePerInspection,
              totalPackPrice: totalPackPrice,
            });
            console.log(`✅ Created ${currency} pricing for ${pack.quantity} pack (${tier.code} tier)`);
          } else {
            console.log(`⏭️  ${currency} pricing for ${pack.quantity} pack (${tier.code} tier) already exists, skipping`);
          }
        }
      }
    }

    // Seed Eco Admin User
    console.log("\n👤 Seeding Eco Admin user...");
    const adminEmail = "nadeem.mohammed@deffinity.com";
    const adminPassword = "Nadeem123#!";
    
    try {
      const existingAdmin = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.email, adminEmail))
        .limit(1);
      
      if (existingAdmin.length === 0) {
        const hashedPassword = await hashPassword(adminPassword);
        await db.insert(adminUsers).values({
          email: adminEmail,
          password: hashedPassword,
          firstName: "Nadeem",
          lastName: "Mohammed",
        });
        console.log(`✅ Created Eco Admin user: ${adminEmail}`);
      } else {
        console.log(`✓ Eco Admin user already exists: ${adminEmail}`);
      }
    } catch (adminError: any) {
      console.error("⚠️ Warning: Failed to seed Eco Admin user:", adminError.message);
      // Don't throw - allow other seeding to continue
    }

    console.log("\n✨ Eco Admin seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding Eco Admin data:", error);
    throw error;
  }
}

// Export the function so it can be called from server startup
export { seedEcoAdmin };

// If run directly (not imported), execute and exit
// This check ensures the file only runs when executed directly via npm run seed:plans
// and NOT when imported by index.ts
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && resolve(process.argv[1]) === resolve(__filename);

if (isMainModule) {
  seedEcoAdmin()
    .then(() => {
      console.log("🎉 Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Fatal error:", error);
      process.exit(1);
    });
}
