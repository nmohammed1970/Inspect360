/**
 * Seed rent/tenancy test data for a staff user'org.
 * Run: npx tsx server/scripts/seedRentTestData.ts
 */
import "dotenv/config";
import { randomBytes, scrypt } from "crypto";
import { promisify } from "util";
import { pool } from "../db";

const scryptAsync = promisify(scrypt);
const STAFF_EMAIL = "washi51214@gmail.com";

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function main() {
  const staffRes = await pool.query(
    `SELECT id, email, role, organization_id, first_name, last_name
     FROM users WHERE lower(email) = lower($1)`,
    [STAFF_EMAIL],
  );
  const staff = staffRes.rows[0];
  if (!staff) throw new Error(`User not found: ${STAFF_EMAIL}`);
  const orgId = staff.organization_id as string;
  console.log("Staff:", staff.email, "org:", orgId, "role:", staff.role);

  await pool.query(
    `UPDATE organizations
     SET rentals_enabled = true, tenancies_enabled = true
     WHERE id = $1`,
    [orgId],
  );

  // Ensure a few properties
  const propSpecs = [
    { name: "Mayfair Apartments", address: "12 Mayfair Road, London W1J 8AJ" },
    { name: "Park View HMO", address: "44 Park View, Manchester M1 2AB" },
    { name: "Rose Court", address: "8 Rose Court, Birmingham B1 1AA" },
  ];

  const propertyIds: string[] = [];
  for (const p of propSpecs) {
    const existing = await pool.query(
      `SELECT id FROM properties WHERE organization_id = $1 AND name = $2 LIMIT 1`,
      [orgId, p.name],
    );
    if (existing.rows[0]) {
      propertyIds.push(existing.rows[0].id);
      continue;
    }
    const inserted = await pool.query(
      `INSERT INTO properties (organization_id, name, address)
       VALUES ($1, $2, $3) RETURNING id`,
      [orgId, p.name, p.address],
    );
    propertyIds.push(inserted.rows[0].id);
  }
  console.log("Properties:", propertyIds.length);

  const tenantSpecs = [
    {
      email: "amelia.reed.demo@inspect360.test",
      firstName: "Amelia",
      lastName: "Reed",
      propertyIndex: 0,
      rent: "1650.00",
      dueDay: 1,
      priorPaid: false,
      openingArrears: "1100.00",
    },
    {
      email: "daniel.cole.demo@inspect360.test",
      firstName: "Daniel",
      lastName: "Cole",
      propertyIndex: 0,
      rent: "1450.00",
      dueDay: 5,
      priorPaid: true,
      openingArrears: "0",
    },
    {
      email: "sofia.khan.demo@inspect360.test",
      firstName: "Sofia",
      lastName: "Khan",
      propertyIndex: 1,
      rent: "1200.00",
      dueDay: 1,
      priorPaid: false,
      openingArrears: "0",
    },
    {
      email: "oliver.white.demo@inspect360.test",
      firstName: "Oliver",
      lastName: "White",
      propertyIndex: 1,
      rent: "900.00",
      dueDay: 15,
      priorPaid: true,
      openingArrears: "0",
    },
    {
      email: "maya.patel.demo@inspect360.test",
      firstName: "Maya",
      lastName: "Patel",
      propertyIndex: 2,
      rent: "875.00",
      dueDay: 10,
      priorPaid: true,
      openingArrears: "0",
    },
    {
      email: "isabella.green.demo@inspect360.test",
      firstName: "Isabella",
      lastName: "Green",
      propertyIndex: 2,
      rent: "1350.00",
      dueDay: 28,
      priorPaid: false,
      openingArrears: "0",
    },
    {
      email: "noah.clarke.demo@inspect360.test",
      firstName: "Noah",
      lastName: "Clarke",
      propertyIndex: 2,
      rent: "1100.00",
      dueDay: 1,
      priorPaid: false,
      openingArrears: "1100.00",
    },
    {
      email: "james.miller.demo@inspect360.test",
      firstName: "James",
      lastName: "Miller",
      propertyIndex: 0,
      rent: "1600.00",
      dueDay: 1,
      priorPaid: true,
      openingArrears: "0",
    },
  ];

  const passwordHash = await hashPassword("DemoTenant123!");
  const leaseStart = new Date("2025-06-01T00:00:00Z");

  for (const t of tenantSpecs) {
    let tenantId: string;
    const existingUser = await pool.query(
      `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [t.email],
    );
    if (existingUser.rows[0]) {
      tenantId = existingUser.rows[0].id;
      await pool.query(
        `UPDATE users SET organization_id = $1, role = 'tenant', first_name = $2, last_name = $3
         WHERE id = $4`,
        [orgId, t.firstName, t.lastName, tenantId],
      );
    } else {
      const username = t.email.split("@")[0].replace(/[^a-z0-9._-]/gi, "").slice(0, 40);
      const created = await pool.query(
        `INSERT INTO users (username, email, password, role, organization_id, first_name, last_name, is_active, onboarding_completed)
         VALUES ($1, $2, $3, 'tenant', $4, $5, $6, true, true) RETURNING id`,
        [username, t.email, passwordHash, orgId, t.firstName, t.lastName],
      );
      tenantId = created.rows[0].id;
    }

    const propertyId = propertyIds[t.propertyIndex];
    let assignmentId: string;
    const existingAssignment = await pool.query(
      `SELECT id FROM tenant_assignments
       WHERE organization_id = $1 AND tenant_id = $2 AND property_id = $3
       LIMIT 1`,
      [orgId, tenantId, propertyId],
    );
    if (existingAssignment.rows[0]) {
      assignmentId = existingAssignment.rows[0].id;
      await pool.query(
        `UPDATE tenant_assignments
         SET monthly_rent = $1, rent_due_day = $2, is_active = true,
             lease_start_date = $3, deposit_amount = $4, updated_at = NOW()
         WHERE id = $5`,
        [t.rent, t.dueDay, leaseStart, t.rent, assignmentId],
      );
    } else {
      const created = await pool.query(
        `INSERT INTO tenant_assignments (
           organization_id, tenant_id, property_id, lease_start_date, monthly_rent,
           deposit_amount, rent_due_day, is_active, has_portal_access
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,true,true) RETURNING id`,
        [orgId, tenantId, propertyId, leaseStart, t.rent, t.rent, t.dueDay],
      );
      assignmentId = created.rows[0].id;
    }

    // Ensure rent account
    let accountId: string;
    const existingAccount = await pool.query(
      `SELECT id FROM rent_accounts WHERE tenancy_id = $1 LIMIT 1`,
      [assignmentId],
    );
    if (existingAccount.rows[0]) {
      accountId = existingAccount.rows[0].id;
      await pool.query(
        `UPDATE rent_accounts SET status = 'active', updated_at = NOW() WHERE id = $1`,
        [accountId],
      );
    } else {
      const created = await pool.query(
        `INSERT INTO rent_accounts (
           organization_id, tenancy_id, property_id, currency, jurisdiction,
           tenancy_type, payer_reference, status
         ) VALUES ($1,$2,$3,'GBP','england','assured_shorthold',$4,'active')
         RETURNING id`,
        [orgId, assignmentId, propertyId, `RENT-${assignmentId.slice(0, 8).toUpperCase()}`],
      );
      accountId = created.rows[0].id;
    }

    const amountMinor = Math.round(parseFloat(t.rent) * 100);

    // Supersede old schedules then add approved monthly schedule
    await pool.query(
      `UPDATE rent_schedule_versions SET status = 'superseded', updated_at = NOW()
       WHERE account_id = $1 AND status = 'approved'`,
      [accountId],
    );
    const schedule = await pool.query(
      `INSERT INTO rent_schedule_versions (
         organization_id, account_id, amount_minor, frequency, due_day,
         effective_from, proration_rule, status, approved_at, notes
       ) VALUES ($1,$2,$3,'monthly',$4,$5,'actual_days','approved',NOW(),'Demo seed schedule')
       RETURNING id`,
      [orgId, accountId, amountMinor, t.dueDay, leaseStart],
    );
    const scheduleId = schedule.rows[0].id;

    // Clear existing demo charges/receipts for clean reseed of this account
    await pool.query(`DELETE FROM rent_allocations WHERE organization_id = $1 AND receipt_id IN (SELECT id FROM rent_receipts WHERE account_id = $2)`, [orgId, accountId]);
    await pool.query(`DELETE FROM rent_receipts WHERE account_id = $1`, [accountId]);
    await pool.query(`DELETE FROM rent_charges WHERE account_id = $1`, [accountId]);
    await pool.query(`DELETE FROM arrears_cases WHERE account_id = $1`, [accountId]);

    // Generate Oct–Jan charges (relative to Nov 2026 demo window)
    const periods = [
      { start: "2026-10-01", end: "2026-10-31", due: "2026-10-01", label: "oct" },
      { start: "2026-11-01", end: "2026-11-30", due: "2026-11-01", label: "nov" },
      { start: "2026-12-01", end: "2026-12-31", due: "2026-12-01", label: "dec" },
      { start: "2027-01-01", end: "2027-01-31", due: "2027-01-01", label: "jan" },
    ];

    // Adjust due day within month (clamp)
    function dueInMonth(ym: string, dueDay: number) {
      const [y, m] = ym.split("-").map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const day = Math.min(dueDay, last);
      return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    const chargeIds: Record<string, string> = {};
    for (const p of periods) {
      const due = dueInMonth(p.start.slice(0, 7), t.dueDay);
      const asOf = new Date("2026-11-25T00:00:00Z");
      const dueDate = new Date(due + "T00:00:00Z");
      let status = "scheduled";
      if (dueDate < asOf) status = "overdue";
      else if (dueDate.getTime() === asOf.getTime()) status = "due";

      // Nov due day after 25 stays scheduled/upcoming for that charge if due > 25
      if (p.label === "nov" && t.dueDay > 25) status = "scheduled";
      if (p.label === "nov" && t.dueDay <= 25) status = "overdue";
      if (p.label === "oct") status = "overdue";

      const ins = await pool.query(
        `INSERT INTO rent_charges (
           organization_id, account_id, schedule_version_id, period_start, period_end,
           due_date, amount_minor, allocated_minor, type, status, posted_at, effective_date,
           currency, idempotency_key
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,0,'rent',$8,NOW(),$6,'GBP',$9)
         RETURNING id`,
        [
          orgId,
          accountId,
          scheduleId,
          p.start,
          p.end,
          due,
          amountMinor,
          status,
          `${accountId}:${scheduleId}:${p.start}:rent`,
        ],
      );
      chargeIds[p.label] = ins.rows[0].id;
    }

    // Opening balance / prior arrears as separate charge if needed
    if (parseFloat(t.openingArrears) > 0) {
      const openMinor = Math.round(parseFloat(t.openingArrears) * 100);
      const open = await pool.query(
        `INSERT INTO rent_charges (
           organization_id, account_id, schedule_version_id, period_start, period_end,
           due_date, amount_minor, allocated_minor, type, status, posted_at, effective_date,
           currency, idempotency_key
         ) VALUES ($1,$2,NULL,'2026-09-01','2026-09-30','2026-09-01',$3,0,'opening_balance','overdue',NOW(),'2026-09-01','GBP',$4)
         RETURNING id`,
        [orgId, accountId, openMinor, `${accountId}:opening:2026-09`],
      );
      chargeIds.opening = open.rows[0].id;
    }

    // Receipts: if priorPaid, pay Oct in full; for some pay partial Nov
    async function addReceipt(amountMajor: string, ref: string, allocateTo: Array<{ key: string; major: string }>) {
      const amountMinor = Math.round(parseFloat(amountMajor) * 100);
      const receipt = await pool.query(
        `INSERT INTO rent_receipts (
           organization_id, account_id, amount_minor, allocated_minor, channel, reference,
           received_at, confirmed_at, status, allocation_state, currency, source
         ) VALUES ($1,$2,$3,0,'manual',$4,'2026-11-10',NOW(),'confirmed','unallocated','GBP','demo_seed')
         RETURNING id`,
        [orgId, accountId, amountMinor, ref],
      );
      const receiptId = receipt.rows[0].id;
      let allocated = 0;
      for (const line of allocateTo) {
        const chargeId = chargeIds[line.key];
        if (!chargeId) continue;
        const lineMinor = Math.round(parseFloat(line.major) * 100);
        await pool.query(
          `INSERT INTO rent_allocations (
             organization_id, receipt_id, charge_id, amount_minor, effective_at
           ) VALUES ($1,$2,$3,$4,'2026-11-10')`,
          [orgId, receiptId, chargeId, lineMinor],
        );
        await pool.query(
          `UPDATE rent_charges
           SET allocated_minor = allocated_minor + $1,
               status = CASE
                 WHEN allocated_minor + $1 >= amount_minor THEN 'paid'
                 WHEN allocated_minor + $1 > 0 THEN 'part_paid'
                 ELSE status
               END,
               updated_at = NOW()
           WHERE id = $2`,
          [lineMinor, chargeId],
        );
        allocated += lineMinor;
      }
      const state =
        allocated >= amountMinor ? "allocated" : allocated > 0 ? "partial" : "unallocated";
      await pool.query(
        `UPDATE rent_receipts SET allocated_minor = $1, allocation_state = $2 WHERE id = $3`,
        [allocated, state, receiptId],
      );
    }

    if (t.priorPaid) {
      await addReceipt(t.rent, `DEMO-OCT-${t.firstName.toUpperCase()}`, [
        { key: "oct", major: t.rent },
      ]);
    }

    // Daniel Cole: partial Nov (£1000 of £1450) — matches demo narrative
    if (t.email.startsWith("daniel.cole")) {
      await addReceipt("1000.00", "DEMO-NOV-DANIEL", [{ key: "nov", major: "1000.00" }]);
    }
    // Maya / Oliver / James: full Nov
    if (
      t.email.startsWith("maya.patel") ||
      t.email.startsWith("oliver.white") ||
      t.email.startsWith("james.miller")
    ) {
      await addReceipt(t.rent, `DEMO-NOV-${t.firstName.toUpperCase()}`, [
        { key: "nov", major: t.rent },
      ]);
    }

    // Open arrears case if overdue remains
    const bal = await pool.query(
      `SELECT COALESCE(SUM(GREATEST(amount_minor - allocated_minor, 0)),0)::int AS overdue
       FROM rent_charges
       WHERE account_id = $1 AND due_date < '2026-11-25' AND status <> 'reversed'`,
      [accountId],
    );
    const overdue = Number(bal.rows[0].overdue || 0);
    if (overdue > 0) {
      await pool.query(
        `INSERT INTO arrears_cases (
           organization_id, account_id, status, overdue_minor, oldest_due_date
         ) VALUES ($1,$2,'review_required',$3,'2026-10-01')
         ON CONFLICT DO NOTHING`,
        [orgId, accountId, overdue],
      );
      // partial unique index may block — try insert ignoring conflict via delete+insert
      await pool.query(`DELETE FROM arrears_cases WHERE account_id = $1 AND status <> 'resolved'`, [
        accountId,
      ]);
      await pool.query(
        `INSERT INTO arrears_cases (
           organization_id, account_id, status, overdue_minor, oldest_due_date
         ) VALUES ($1,$2,'review_required',$3,'2026-10-01')`,
        [orgId, accountId, overdue],
      );
    }

    console.log(`✓ ${t.firstName} ${t.lastName} · £${t.rent} · account ${accountId.slice(0, 8)}`);
  }

  // Two unmatched bank lines for reconciliation tab
  await pool.query(
    `DELETE FROM bank_transactions WHERE organization_id = $1 AND import_batch_id = 'DEMO-SEED'`,
    [orgId],
  );
  await pool.query(
    `INSERT INTO bank_transactions (
       organization_id, bank_account_label, value_date, amount_minor, currency, direction,
       reference, source_id, fingerprint, match_state, import_batch_id
     ) VALUES
     ($1,'Primary','2026-11-24',85000,'GBP','in','S KHAN RENT','DEMO-BK-601','demo-fp-601','unmatched','DEMO-SEED'),
     ($1,'Primary','2026-11-25',50000,'GBP','in','D COLE','DEMO-BK-602','demo-fp-602','unmatched','DEMO-SEED')`,
    [orgId],
  );

  // One rent review awaiting assessment
  const reviewAccount = await pool.query(
    `SELECT id FROM rent_accounts WHERE organization_id = $1 ORDER BY created_at LIMIT 1`,
    [orgId],
  );
  if (reviewAccount.rows[0]) {
    await pool.query(`DELETE FROM rent_reviews WHERE organization_id = $1 AND eligibility_notes LIKE 'Demo seed%'`, [
      orgId,
    ]);
    await pool.query(
      `INSERT INTO rent_reviews (
         organization_id, account_id, current_amount_minor, proposed_amount_minor, status,
         eligibility_notes, proposed_effective_date
       ) VALUES ($1,$2,165000,175000,'eligibility_check','Demo seed — check 12-month / notice rules','2027-01-01')`,
      [orgId, reviewAccount.rows[0].id],
    );
  }

  console.log("\nDone. Open Finance › Rent management as", STAFF_EMAIL);
  console.log("Demo tenant login password for all seeded tenants: DemoTenant123!");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
