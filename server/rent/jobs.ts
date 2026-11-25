import { eq } from "drizzle-orm";
import { db } from "../db";
import { organizations } from "@shared/schema";
import { isCompanyModuleEnabled } from "@shared/companyModules";
import {
  generateChargesForAccount,
  provisionAccountsForOrganization,
  refreshChargeStatuses,
} from "./service";
import { syncArrearsCasesForOrganization } from "./arrears";
import { seedUpcomingReviews } from "./reviews";
import { rentAccounts } from "@shared/schema";

/**
 * Daily / hourly rent ledger jobs — idempotent.
 * Called alongside processRentFinanceJobs.
 */
export async function processRentLedgerJobs(): Promise<{
  orgs: number;
  accountsProvisioned: number;
  chargesCreated: number;
  statusesUpdated: number;
  arrears: { opened: number; updated: number; resolved: number };
  reviewsSeeded: number;
}> {
  const orgs = await db.select().from(organizations);
  let accountsProvisioned = 0;
  let chargesCreated = 0;
  let statusesUpdated = 0;
  let reviewsSeeded = 0;
  const arrearsTotals = { opened: 0, updated: 0, resolved: 0 };
  let processedOrgs = 0;

  for (const org of orgs) {
    if (!isCompanyModuleEnabled(org, "rentals")) continue;
    processedOrgs += 1;

    try {
      const provisioned = await provisionAccountsForOrganization(org.id);
      accountsProvisioned += provisioned.created;

      const accounts = await db
        .select()
        .from(rentAccounts)
        .where(eq(rentAccounts.organizationId, org.id));

      for (const account of accounts) {
        if (account.status !== "active") continue;
        chargesCreated += await generateChargesForAccount(account.id);
      }

      statusesUpdated += await refreshChargeStatuses(org.id);
      const arrears = await syncArrearsCasesForOrganization(org.id);
      arrearsTotals.opened += arrears.opened;
      arrearsTotals.updated += arrears.updated;
      arrearsTotals.resolved += arrears.resolved;

      const reviews = await seedUpcomingReviews(org.id);
      reviewsSeeded += reviews.created;
    } catch (err) {
      console.error(`[RentLedger] Org ${org.id} failed:`, err);
    }
  }

  return {
    orgs: processedOrgs,
    accountsProvisioned,
    chargesCreated,
    statusesUpdated,
    arrears: arrearsTotals,
    reviewsSeeded,
  };
}
