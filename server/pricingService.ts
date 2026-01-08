import { storage } from "./storage";
import { type SubscriptionTier, type MarketplaceModule } from "@shared/schema";

export class PricingService {
    // Detect the appropriate tier based on inspection count
    // New tier ranges:
    // 10-29: Starter (includes 10) - MINIMUM
    // 30-74: Growth (includes 30)
    // 75-199: Professional (includes 75)
    // 200-500: Enterprise (includes 200)
    // 500+: Enterprise (max tier, no Enterprise Plus)
    detectTier(inspectionCount: number, tiers: SubscriptionTier[]): SubscriptionTier | undefined {
        // Filter out inactive tiers and sort by included inspections (ascending)
        const activeTiers = tiers.filter(t => t.isActive !== false);
        const sortedTiers = [...activeTiers].sort((a, b) => a.includedInspections - b.includedInspections);

        // Enforce minimum 10 inspections - use Starter tier
        const minCount = Math.max(inspectionCount, 10);

        // If count > 500, use Enterprise (the highest tier)
        if (minCount > 500) {
            return sortedTiers.find(t => t.code === "enterprise") || sortedTiers[sortedTiers.length - 1];
        }

        // Find the tier where minCount falls within its range
        // Range is from tier's includedInspections up to (but not including) next tier's includedInspections
        for (let i = 0; i < sortedTiers.length; i++) {
            const currentTier = sortedTiers[i];
            const nextTier = sortedTiers[i + 1];
            
            // If this is the last tier, use it if count >= its includedInspections
            if (!nextTier) {
                if (minCount >= currentTier.includedInspections) {
                    return currentTier;
                }
            } else {
                // Check if minCount falls within this tier's range
                // Range: [currentTier.includedInspections, nextTier.includedInspections)
                if (minCount >= currentTier.includedInspections && minCount < nextTier.includedInspections) {
                    return currentTier;
                }
            }
        }

        // Fallback: return the highest tier
        return sortedTiers[sortedTiers.length - 1];
    }

    // Calculate the most cost-effective pack combination for additional inspections
    // Uses dynamic programming to find optimal combination
    async calculateSmartPacks(
        extraCount: number,
        tierId: string,
        currencyCode: string
    ): Promise<Array<{ packId: string; name: string; quantity: number; price: number }>> {
        if (extraCount <= 0) return [];

        const packs = await storage.getAddonPacks();
        const packPrices = await Promise.all(
            packs
                .filter(pack => pack.isActive)
                .map(async (pack) => {
                    const pricing = await storage.getAddonPackPricing(pack.id, tierId, currencyCode);
                    return {
                        packId: pack.id,
                        name: pack.name,
                        quantity: pack.inspectionQuantity,
                        price: pricing?.totalPackPrice || 0,
                        pricePerInspection: pricing?.pricePerInspection || 0
                    };
                })
        );

        // Filter out packs with invalid pricing
        const validPacks = packPrices.filter(p => p.price > 0 && p.quantity > 0);
        if (validPacks.length === 0) return [];

        // Sort by quantity (ascending) for easier processing
        validPacks.sort((a, b) => a.quantity - b.quantity);

        // Dynamic programming approach to find optimal combination
        // dp[i] = minimum cost to get exactly i inspections
        const dp: Array<{ cost: number; packs: Array<{ packId: string; name: string; quantity: number; price: number }> }> = [];
        dp[0] = { cost: 0, packs: [] };

        for (let i = 1; i <= extraCount + Math.max(...validPacks.map(p => p.quantity)); i++) {
            dp[i] = { cost: Infinity, packs: [] };

            for (const pack of validPacks) {
                if (i >= pack.quantity) {
                    const prevCost = dp[i - pack.quantity].cost;
                    if (prevCost !== Infinity && prevCost + pack.price < dp[i].cost) {
                        dp[i] = {
                            cost: prevCost + pack.price,
                            packs: [...dp[i - pack.quantity].packs, {
                                packId: pack.packId,
                                name: pack.name,
                                quantity: pack.quantity,
                                price: pack.price
                            }]
                        };
                    }
                }
            }
        }

        // Find the best solution: exact match or closest with minimal waste
        let bestSolution = dp[extraCount];
        if (bestSolution.cost === Infinity) {
            // If exact match not possible, find closest with minimal waste
            for (let i = extraCount + 1; i < dp.length; i++) {
                if (dp[i].cost !== Infinity) {
                    bestSolution = dp[i];
                    break;
                }
            }
        }

        // If still no solution, fall back to greedy: use largest pack that fits
        if (bestSolution.cost === Infinity || bestSolution.packs.length === 0) {
            const largestPack = validPacks[validPacks.length - 1];
            const packsNeeded = Math.ceil(extraCount / largestPack.quantity);
            return Array(packsNeeded).fill(null).map(() => ({
                packId: largestPack.packId,
                name: largestPack.name,
                quantity: largestPack.quantity,
                price: largestPack.price
            }));
        }

        // Group packs by ID and sum quantities
        const packMap = new Map<string, { packId: string; name: string; quantity: number; price: number; count: number }>();
        for (const pack of bestSolution.packs) {
            const existing = packMap.get(pack.packId);
            if (existing) {
                existing.count++;
            } else {
                packMap.set(pack.packId, { ...pack, count: 1 });
            }
        }

        // Return consolidated packs
        return Array.from(packMap.values()).map(p => ({
            packId: p.packId,
            name: p.name,
            quantity: p.quantity * p.count,
            price: p.price * p.count
        }));
    }

    async calculatePricing(
        inspectionCount: number,
        currencyCode: string = "GBP",
        organizationId?: string
    ) {
        const tiers = await storage.getSubscriptionTiers();
        const modules = await storage.getMarketplaceModules();

        // Enforce minimum 10 inspections
        const minInspectionCount = Math.max(inspectionCount, 10);
        
        // 1. Detect appropriate tier
        const detectedTier = this.detectTier(minInspectionCount, tiers);
        if (!detectedTier) {
            throw new Error("Could not detect appropriate tier for inspection count");
        }

        // 2. Get tier pricing for currency (with instance override if applicable)
        let tierPrice = await storage.getTierPricing(detectedTier.id, currencyCode);
        
        // Apply instance-level override if organizationId is provided
        if (organizationId) {
            const instanceSub = await storage.getInstanceSubscription(organizationId);
            if (instanceSub && instanceSub.currentTierId === detectedTier.id) {
                // Check for override
                if (instanceSub.overrideMonthlyFee) {
                    tierPrice = {
                        ...tierPrice,
                        priceMonthly: instanceSub.overrideMonthlyFee,
                        // Keep annual if override not set
                        priceAnnual: instanceSub.overrideAnnualFee || tierPrice?.priceAnnual || 0
                    };
                } else if (instanceSub.overrideAnnualFee) {
                    tierPrice = {
                        ...tierPrice,
                        priceAnnual: instanceSub.overrideAnnualFee,
                        // Keep monthly if override not set
                        priceMonthly: tierPrice?.priceMonthly || 0
                    };
                }
            }
        }

        // 3. Calculate inspection pack recommendations if needed
        const inspectionsOverTier = Math.max(0, minInspectionCount - detectedTier.includedInspections);
        const recommendedPacks = inspectionsOverTier > 0
            ? await this.calculateSmartPacks(inspectionsOverTier, detectedTier.id, currencyCode)
            : [];

        const addonCost = recommendedPacks.reduce((sum, pack) => sum + pack.price, 0);

        // 4. Get module statuses and pricing for organization if provided
        let moduleStatuses = await Promise.all(modules.map(async m => {
            const mPrice = await storage.getModulePricing(m.id, currencyCode);
            return {
                ...m,
                monthlyPrice: mPrice?.priceMonthly || 0,
                annualPrice: mPrice?.priceAnnual || 0,
                isEnabled: false
            };
        }));

        if (organizationId) {
            const instanceSub = await storage.getInstanceSubscription(organizationId);
            if (instanceSub) {
                const activeModules = await storage.getInstanceModules(instanceSub.id);
                const moduleOverrides = await storage.getInstanceModuleOverrides(instanceSub.id);
                
                moduleStatuses = moduleStatuses.map(m => {
                    const active = activeModules.find(am => am.moduleId === m.id);
                    const override = moduleOverrides.find(o => o.moduleId === m.id && o.isActive);
                    
                    // Apply override if exists
                    let monthlyPrice = m.monthlyPrice;
                    let annualPrice = m.annualPrice;
                    if (override) {
                        monthlyPrice = override.overrideMonthlyPrice || monthlyPrice;
                        annualPrice = override.overrideAnnualPrice || annualPrice;
                    }
                    
                    return {
                        ...m,
                        monthlyPrice,
                        annualPrice,
                        isEnabled: active?.isEnabled || false,
                        enabledDate: active?.enabledDate
                    };
                });
            }
        }

        // Calculate Bundle Costs and identify bundled modules
        let totalBundlesMonthly = 0;
        let totalBundlesAnnual = 0;
        const coveredModuleIds = new Set<string>();

        if (organizationId) {
            const instanceSub = await storage.getInstanceSubscription(organizationId);
            if (instanceSub) {
                const activeBundles = await storage.getInstanceBundles(instanceSub.id);
                for (const b of activeBundles) {
                    const bPricing = await storage.getBundlePricing(b.bundleId, currencyCode);
                    if (bPricing) {
                        totalBundlesMonthly += bPricing.priceMonthly;
                        totalBundlesAnnual += bPricing.priceAnnual;
                    }
                    const bModules = await storage.getBundleModules(b.bundleId);
                    bModules.forEach(m => coveredModuleIds.add(m.moduleId));
                }
            }
        }

        const enabledModules = moduleStatuses.filter(m => m.isEnabled && !coveredModuleIds.has(m.id));
        const totalModulesMonthly = enabledModules.reduce((sum, m) => sum + (m.monthlyPrice || 0), 0) + totalBundlesMonthly;
        const totalModulesAnnual = enabledModules.reduce((sum, m) => sum + (m.annualPrice || 0), 0) + totalBundlesAnnual;

        // 5. Smart Upgrade Recommendation
        // Only recommend if user needs more inspections than current tier provides
        let upgradeRecommendation = null;
        if (inspectionsOverTier > 0) {
            const currentTierIndex = tiers.findIndex(t => t.id === detectedTier.id);
            if (currentTierIndex >= 0 && currentTierIndex < tiers.length - 1) {
                const nextTier = tiers[currentTierIndex + 1];
                
                // Only recommend if next tier includes enough inspections
                if (nextTier.includedInspections >= inspectionCount) {
                    const nextTierPrice = await storage.getTierPricing(nextTier.id, currencyCode);
                    
                    // Current cost: tier + add-ons + modules
                    const currentTotalMonthly = (tierPrice?.priceMonthly || 0) + addonCost + totalModulesMonthly;
                    // Next tier cost: just tier + modules (no add-ons needed)
                    const nextTotalMonthly = (nextTierPrice?.priceMonthly || 0) + totalModulesMonthly;

                    if (nextTotalMonthly < currentTotalMonthly && nextTier.includedInspections >= inspectionCount) {
                        const savings = currentTotalMonthly - nextTotalMonthly;
                        upgradeRecommendation = {
                            recommendedTier: nextTier.name,
                            savings: savings,
                            message: `Upgrade to ${nextTier.name} (${nextTier.includedInspections} included) and save ${currencyCode} ${(savings / 100).toFixed(2)}/month`
                        };
                    }
                }
            }
        }

        const baseMonthly = tierPrice?.priceMonthly || (currencyCode === "GBP" ? detectedTier.basePriceMonthly : 0);
        const baseAnnual = tierPrice?.priceAnnual || (currencyCode === "GBP" ? detectedTier.basePriceAnnual : 0);

        return {
            tier: {
                id: detectedTier.id,
                name: detectedTier.name,
                code: detectedTier.code,
                description: detectedTier.description,
                tier_id: detectedTier.id,
                tier_name: detectedTier.name,
                included_inspections: detectedTier.includedInspections,
                base_price: baseMonthly / 100, // Convert from minor units
                currency: currencyCode
            },
            additional_inspections: inspectionsOverTier > 0 ? {
                count: inspectionsOverTier,
                recommended_pack: recommendedPacks[0]?.name || "Custom",
                pack_price: addonCost / 100, // Convert from minor units
                price_per_inspection: recommendedPacks[0] ? (recommendedPacks[0].price / recommendedPacks[0].quantity) / 100 : 0
            } : null,
            modules: moduleStatuses.map(m => ({
                module_id: m.id,
                module_name: m.name,
                price: (m.monthlyPrice || 0) / 100
            })),
            subtotals: {
                tier_cost: baseMonthly / 100,
                addon_cost: addonCost / 100,
                module_cost: totalModulesMonthly / 100
            },
            total: (baseMonthly + addonCost + totalModulesMonthly) / 100,
            currency: currencyCode,
            billing_cycle: "monthly", // Default, could be passed as parameter
            upgrade_recommendation: upgradeRecommendation ? {
                recommended_tier: upgradeRecommendation.recommendedTier,
                savings: upgradeRecommendation.savings / 100,
                message: upgradeRecommendation.message
            } : null,
            // Legacy fields for backward compatibility
            recommendedPacks,
            calculations: {
                baseMonthly,
                baseAnnual,
                modulesMonthly: totalModulesMonthly,
                modulesAnnual: totalModulesAnnual,
                totalMonthly: baseMonthly + addonCost + totalModulesMonthly,
                totalAnnual: baseAnnual + totalModulesAnnual
            }
        };
    }

    // Calculate instance price with override priority
    async calculateInstancePrice(
        organizationId: string,
        billingCycle: "monthly" | "annual"
    ): Promise<number> {
        const instanceSub = await storage.getInstanceSubscription(organizationId);
        if (!instanceSub) {
            throw new Error(`Instance subscription not found for organization ${organizationId}`);
        }

        // 1. Check for instance-level overrides first
        if (billingCycle === "monthly" && instanceSub.overrideMonthlyFee) {
            return instanceSub.overrideMonthlyFee;
        }
        if (billingCycle === "annual" && instanceSub.overrideAnnualFee) {
            return instanceSub.overrideAnnualFee;
        }

        // 2. Fall back to standard tier pricing in instance currency
        if (!instanceSub.currentTierId) {
            throw new Error("Instance has no tier assigned");
        }

        const tierPricing = await storage.getTierPricing(
            instanceSub.currentTierId,
            instanceSub.registrationCurrency
        );

        if (billingCycle === "monthly") {
            return tierPricing?.priceMonthly || 0;
        } else {
            return tierPricing?.priceAnnual || 0;
        }
    }

    // Calculate module price with override priority
    async calculateModulePrice(
        organizationId: string,
        moduleId: string,
        billingCycle: "monthly" | "annual"
    ): Promise<number> {
        // 1. Check for instance-level module override
        const instanceSub = await storage.getInstanceSubscription(organizationId);
        if (!instanceSub) {
            throw new Error(`Instance subscription not found for organization ${organizationId}`);
        }

        const moduleOverride = (await storage.getInstanceModuleOverrides(instanceSub.id))
            .find(o => o.moduleId === moduleId && o.isActive);

        if (moduleOverride) {
            if (billingCycle === "monthly" && moduleOverride.overrideMonthlyPrice) {
                return moduleOverride.overrideMonthlyPrice;
            }
            if (billingCycle === "annual" && moduleOverride.overrideAnnualPrice) {
                return moduleOverride.overrideAnnualPrice;
            }
        }

        // 2. Check if part of active bundle (bundle price takes precedence)
        const activeBundles = await storage.getInstanceBundles(instanceSub.id);
        for (const bundle of activeBundles.filter(b => b.isActive)) {
            const bundleModules = await storage.getBundleModules(bundle.bundleId);
            if (bundleModules.some(bm => bm.moduleId === moduleId)) {
                return 0; // Module cost covered by bundle
            }
        }

        // 3. Fall back to standard module pricing
        const modulePricing = await storage.getModulePricing(
            moduleId,
            instanceSub.registrationCurrency
        );

        if (billingCycle === "monthly") {
            return modulePricing?.priceMonthly || 0;
        } else {
            return modulePricing?.priceAnnual || 0;
        }
    }

    // Check if module is available for instance
    async isModuleAvailableForInstance(
        moduleId: string,
        organizationId: string
    ): Promise<boolean> {
        // Check 1: Is module globally enabled at eco-admin level?
        const module = (await storage.getMarketplaceModules()).find(m => m.id === moduleId);
        if (!module || !module.isAvailableGlobally) {
            return false;
        }

        // Check 2: Is module enabled for this instance?
        const instanceSub = await storage.getInstanceSubscription(organizationId);
        if (!instanceSub) {
            return false;
        }

        const instanceModule = (await storage.getInstanceModules(instanceSub.id))
            .find(im => im.moduleId === moduleId);

        if (!instanceModule || !instanceModule.isEnabled) {
            return false;
        }

        return true;
    }
}

export const pricingService = new PricingService();
