/**
 * Seed Communications Hub test cases for a staff user's org.
 * Run: npx tsx server/scripts/seedCommunicationsTestData.ts
 *
 * Covers inbox queues: unassigned, my cases, urgent, overdue,
 * awaiting approval/tenant, closed, plus messages/actions/approvals/links.
 */
import "dotenv/config";
import { randomBytes, scrypt } from "crypto";
import { promisify } from "util";
import { pool } from "../db";
import { DEFAULT_COMMUNICATION_CATEGORIES } from "@shared/schema";

const scryptAsync = promisify(scrypt);
const STAFF_EMAIL = "washi51214@gmail.com";
const REF_PREFIX = "SEED-COM-";

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000);
}

async function ensureCategories(orgId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const def of DEFAULT_COMMUNICATION_CATEGORIES) {
    const existing = await pool.query(
      `SELECT id FROM communication_categories
       WHERE organization_id = $1 AND key = $2 LIMIT 1`,
      [orgId, def.key],
    );
    if (existing.rows[0]) {
      map.set(def.key, existing.rows[0].id);
      continue;
    }
    const firstResponse = def.key === "health_safety" ? 1 : def.key === "maintenance" ? 4 : 8;
    const resolution = def.key === "health_safety" ? 24 : 48;
    const inserted = await pool.query(
      `INSERT INTO communication_categories (
         organization_id, key, label, default_priority, approval_policy,
         first_response_hours, resolution_hours, sort_order, active, version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,1)
       RETURNING id`,
      [
        orgId,
        def.key,
        def.label,
        def.defaultPriority,
        def.approvalPolicy,
        firstResponse,
        resolution,
        def.sortOrder,
      ],
    );
    map.set(def.key, inserted.rows[0].id);
  }
  return map;
}

async function ensureProperty(
  orgId: string,
  name: string,
  address: string,
): Promise<string> {
  const existing = await pool.query(
    `SELECT id FROM properties WHERE organization_id = $1 AND name = $2 LIMIT 1`,
    [orgId, name],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await pool.query(
    `INSERT INTO properties (organization_id, name, address)
     VALUES ($1, $2, $3) RETURNING id`,
    [orgId, name, address],
  );
  return inserted.rows[0].id;
}

async function ensureTenant(
  orgId: string,
  email: string,
  firstName: string,
  lastName: string,
  propertyId: string,
  passwordHash: string,
): Promise<{ tenantId: string; tenancyId: string | null }> {
  let tenantId: string;
  const existingUser = await pool.query(
    `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  );
  if (existingUser.rows[0]) {
    tenantId = existingUser.rows[0].id;
    await pool.query(
      `UPDATE users
       SET organization_id = $1, role = 'tenant', first_name = $2, last_name = $3, is_active = true
       WHERE id = $4`,
      [orgId, firstName, lastName, tenantId],
    );
  } else {
    const username = email.split("@")[0].replace(/[^a-z0-9._-]/gi, "").slice(0, 40);
    const created = await pool.query(
      `INSERT INTO users (
         username, email, password, role, organization_id, first_name, last_name,
         is_active, onboarding_completed
       ) VALUES ($1,$2,$3,'tenant',$4,$5,$6,true,true) RETURNING id`,
      [username, email, passwordHash, orgId, firstName, lastName],
    );
    tenantId = created.rows[0].id;
  }

  const assignment = await pool.query(
    `SELECT id FROM tenant_assignments
     WHERE organization_id = $1 AND tenant_id = $2 AND property_id = $3
     LIMIT 1`,
    [orgId, tenantId, propertyId],
  );
  if (assignment.rows[0]) {
    return { tenantId, tenancyId: assignment.rows[0].id };
  }

  try {
    const created = await pool.query(
      `INSERT INTO tenant_assignments (
         organization_id, tenant_id, property_id, lease_start_date, monthly_rent,
         deposit_amount, rent_due_day, is_active, has_portal_access
       ) VALUES ($1,$2,$3,$4,$5,$6,1,true,true) RETURNING id`,
      [orgId, tenantId, propertyId, new Date("2025-06-01T00:00:00Z"), "1200.00", "1200.00"],
    );
    return { tenantId, tenancyId: created.rows[0].id };
  } catch {
    return { tenantId, tenancyId: null };
  }
}

type MsgSpec = {
  direction: "inbound" | "outbound";
  visibility: "tenant" | "internal";
  channel: string;
  body: string;
  author: "tenant" | "staff" | null;
  hoursOffset: number;
  deliveryStatus?: string;
};

async function insertCase(opts: {
  orgId: string;
  reference: string;
  subject: string;
  categoryId: string;
  status: string;
  priority: string;
  source: string;
  tenantId?: string | null;
  tenancyId?: string | null;
  propertyId?: string | null;
  ownerUserId?: string | null;
  createdByUserId?: string | null;
  summary?: string;
  unreadForStaff?: boolean;
  unreadForTenant?: boolean;
  createdAt: Date;
  updatedAt: Date;
  firstResponseDueAt?: Date | null;
  resolutionDueAt?: Date | null;
  firstResponseAt?: Date | null;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  resolutionSummary?: string | null;
  nextActionAt?: Date | null;
}): Promise<string> {
  const inserted = await pool.query(
    `INSERT INTO communication_cases (
       organization_id, reference, subject, category_id, status, priority, source,
       tenant_id, tenancy_id, property_id, owner_user_id, created_by_user_id, summary,
       unread_for_staff, unread_for_tenant, created_at, updated_at,
       first_response_due_at, resolution_due_at, first_response_at,
       resolved_at, closed_at, resolution_summary, next_action_at, version
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,1
     ) RETURNING id`,
    [
      opts.orgId,
      opts.reference,
      opts.subject,
      opts.categoryId,
      opts.status,
      opts.priority,
      opts.source,
      opts.tenantId ?? null,
      opts.tenancyId ?? null,
      opts.propertyId ?? null,
      opts.ownerUserId ?? null,
      opts.createdByUserId ?? null,
      opts.summary ?? null,
      opts.unreadForStaff ?? false,
      opts.unreadForTenant ?? false,
      opts.createdAt,
      opts.updatedAt,
      opts.firstResponseDueAt ?? null,
      opts.resolutionDueAt ?? null,
      opts.firstResponseAt ?? null,
      opts.resolvedAt ?? null,
      opts.closedAt ?? null,
      opts.resolutionSummary ?? null,
      opts.nextActionAt ?? null,
    ],
  );
  return inserted.rows[0].id;
}

async function insertMessages(
  orgId: string,
  caseId: string,
  staffId: string,
  staffName: string,
  tenantId: string | null,
  tenantName: string | null,
  messages: MsgSpec[],
  baseCreatedAt: Date,
) {
  for (const m of messages) {
    const at = new Date(baseCreatedAt.getTime() + m.hoursOffset * 60 * 60 * 1000);
    const authorId =
      m.author === "staff" ? staffId : m.author === "tenant" ? tenantId : null;
    const authorName =
      m.author === "staff" ? staffName : m.author === "tenant" ? tenantName : null;
    await pool.query(
      `INSERT INTO communication_messages (
         organization_id, case_id, direction, visibility, channel, body,
         author_user_id, author_name_snapshot, delivery_status,
         received_at, sent_at, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        orgId,
        caseId,
        m.direction,
        m.visibility,
        m.channel,
        m.body,
        authorId,
        authorName,
        m.deliveryStatus ?? "not_applicable",
        m.direction === "inbound" ? at : null,
        m.direction === "outbound" ? at : null,
        at,
      ],
    );
  }
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
  const staffId = staff.id as string;
  const staffName =
    [staff.first_name, staff.last_name].filter(Boolean).join(" ").trim() || "Staff";
  console.log("Staff:", staff.email, "org:", orgId);

  await pool.query(
    `UPDATE organizations
     SET communications_enabled = true,
         communications_emergency_guidance = COALESCE(
           NULLIF(communications_emergency_guidance, ''),
           'For gas leaks call the National Gas Emergency number 0800 111 999. For fire or medical emergencies dial 999.'
         )
     WHERE id = $1`,
    [orgId],
  );
  console.log("Enabled communications_enabled on org");

  const categories = await ensureCategories(orgId);
  console.log("Categories:", categories.size);

  // Clear previous seed cases (and dependents) for idempotent re-runs
  const old = await pool.query(
    `SELECT id FROM communication_cases
     WHERE organization_id = $1 AND reference LIKE $2`,
    [orgId, `${REF_PREFIX}%`],
  );
  const oldIds = old.rows.map((r) => r.id as string);
  if (oldIds.length) {
    await pool.query(
      `DELETE FROM communication_messages WHERE case_id = ANY($1::varchar[])`,
      [oldIds],
    );
    await pool.query(
      `DELETE FROM communication_actions WHERE case_id = ANY($1::varchar[])`,
      [oldIds],
    );
    await pool.query(
      `DELETE FROM communication_approvals WHERE case_id = ANY($1::varchar[])`,
      [oldIds],
    );
    await pool.query(
      `DELETE FROM communication_case_links WHERE case_id = ANY($1::varchar[])`,
      [oldIds],
    );
    await pool.query(
      `DELETE FROM communication_audit_events WHERE case_id = ANY($1::varchar[])`,
      [oldIds],
    );
    await pool.query(
      `DELETE FROM communication_sla_events WHERE case_id = ANY($1::varchar[])`,
      [oldIds],
    );
    await pool.query(
      `DELETE FROM communication_cases WHERE id = ANY($1::varchar[])`,
      [oldIds],
    );
    console.log("Cleared previous seed cases:", oldIds.length);
  }

  const mayfair = await ensureProperty(
    orgId,
    "Mayfair Apartments",
    "12 Mayfair Road, London W1J 8AJ",
  );
  const parkView = await ensureProperty(
    orgId,
    "Park View HMO",
    "44 Park View, Manchester M1 2AB",
  );
  const roseCourt = await ensureProperty(
    orgId,
    "Rose Court",
    "8 Rose Court, Birmingham B1 1AA",
  );

  const passwordHash = await hashPassword("DemoTenant123!");
  const tenants = {
    amelia: await ensureTenant(
      orgId,
      "amelia.reed.demo@inspect360.test",
      "Amelia",
      "Reed",
      mayfair,
      passwordHash,
    ),
    daniel: await ensureTenant(
      orgId,
      "daniel.cole.demo@inspect360.test",
      "Daniel",
      "Cole",
      mayfair,
      passwordHash,
    ),
    sofia: await ensureTenant(
      orgId,
      "sofia.khan.demo@inspect360.test",
      "Sofia",
      "Khan",
      parkView,
      passwordHash,
    ),
    oliver: await ensureTenant(
      orgId,
      "oliver.white.demo@inspect360.test",
      "Oliver",
      "White",
      parkView,
      passwordHash,
    ),
    maya: await ensureTenant(
      orgId,
      "maya.patel.demo@inspect360.test",
      "Maya",
      "Patel",
      roseCourt,
      passwordHash,
    ),
    isabella: await ensureTenant(
      orgId,
      "isabella.green.demo@inspect360.test",
      "Isabella",
      "Green",
      roseCourt,
      passwordHash,
    ),
    noah: await ensureTenant(
      orgId,
      "noah.clarke.demo@inspect360.test",
      "Noah",
      "Clarke",
      roseCourt,
      passwordHash,
    ),
    james: await ensureTenant(
      orgId,
      "james.miller.demo@inspect360.test",
      "James",
      "Miller",
      mayfair,
      passwordHash,
    ),
  };

  const cat = (key: string) => {
    const id = categories.get(key);
    if (!id) throw new Error(`Missing category ${key}`);
    return id;
  };

  // 1 — Unassigned + unread (new)
  const case1 = await insertCase({
    orgId,
    reference: `${REF_PREFIX}001`,
    subject: "Leaking kitchen tap – Flat 2A",
    categoryId: cat("maintenance"),
    status: "new",
    priority: "medium",
    source: "tenant_portal",
    tenantId: tenants.amelia.tenantId,
    tenancyId: tenants.amelia.tenancyId,
    propertyId: mayfair,
    ownerUserId: null,
    createdByUserId: tenants.amelia.tenantId,
    summary: "Constant drip under kitchen sink; cupboard damp.",
    unreadForStaff: true,
    createdAt: hoursAgo(3),
    updatedAt: hoursAgo(3),
    firstResponseDueAt: hoursFromNow(1),
    resolutionDueAt: hoursFromNow(45),
  });
  await insertMessages(
    orgId,
    case1,
    staffId,
    staffName,
    tenants.amelia.tenantId,
    "Amelia Reed",
    [
      {
        direction: "inbound",
        visibility: "tenant",
        channel: "tenant_portal",
        body: "Hi — the kitchen tap has been dripping non-stop since yesterday evening. The cupboard under the sink is getting damp. Can someone take a look?",
        author: "tenant",
        hoursOffset: 0,
      },
    ],
    hoursAgo(3),
  );

  // 2 — My cases / in progress (boiler)
  const case2 = await insertCase({
    orgId,
    reference: `${REF_PREFIX}002`,
    subject: "Boiler not heating – Flat 1B",
    categoryId: cat("maintenance"),
    status: "in_progress",
    priority: "high",
    source: "tenant_portal",
    tenantId: tenants.daniel.tenantId,
    tenancyId: tenants.daniel.tenancyId,
    propertyId: mayfair,
    ownerUserId: staffId,
    createdByUserId: tenants.daniel.tenantId,
    summary: "No hot water or heating since Monday morning.",
    unreadForStaff: false,
    unreadForTenant: true,
    createdAt: daysAgo(2),
    updatedAt: hoursAgo(5),
    firstResponseDueAt: daysAgo(2),
    resolutionDueAt: hoursFromNow(20),
    firstResponseAt: daysAgo(1),
    nextActionAt: hoursFromNow(6),
  });
  await insertMessages(
    orgId,
    case2,
    staffId,
    staffName,
    tenants.daniel.tenantId,
    "Daniel Cole",
    [
      {
        direction: "inbound",
        visibility: "tenant",
        channel: "tenant_portal",
        body: "The boiler won't fire up — no heating and no hot water. Pressure gauge is on red.",
        author: "tenant",
        hoursOffset: 0,
      },
      {
        direction: "outbound",
        visibility: "tenant",
        channel: "app",
        body: "Thanks Daniel — we've raised a priority engineer visit. Please keep an eye out for a call today.",
        author: "staff",
        hoursOffset: 6,
        deliveryStatus: "delivered",
      },
      {
        direction: "outbound",
        visibility: "internal",
        channel: "app",
        body: "Booked Gas Safe engineer for tomorrow AM. Confirm access with Daniel.",
        author: "staff",
        hoursOffset: 7,
      },
    ],
    daysAgo(2),
  );
  await pool.query(
    `INSERT INTO communication_actions (
       organization_id, case_id, title, description, assignee_id, due_at, status, required, sort_order
     ) VALUES
       ($1,$2,'Confirm engineer access window',NULL,$3,$4,'open',true,1),
       ($1,$2,'Raise job with Gas Safe contractor','Priority heating fault',$3,$5,'completed',true,0)`,
    [orgId, case2, staffId, hoursFromNow(8), hoursAgo(20)],
  );
  await pool.query(
    `UPDATE communication_actions
     SET completed_by = $1, completed_at = $2
     WHERE case_id = $3 AND status = 'completed'`,
    [staffId, hoursAgo(20), case2],
  );

  // 3 — Urgent health & safety
  const case3 = await insertCase({
    orgId,
    reference: `${REF_PREFIX}003`,
    subject: "Possible gas smell reported",
    categoryId: cat("health_safety"),
    status: "triaged",
    priority: "urgent",
    source: "phone",
    tenantId: tenants.sofia.tenantId,
    tenancyId: tenants.sofia.tenancyId,
    propertyId: parkView,
    ownerUserId: staffId,
    createdByUserId: staffId,
    summary: "Tenant reported faint gas odour near cooker — advised to call National Gas Emergency.",
    unreadForStaff: true,
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(0.5),
    firstResponseDueAt: hoursFromNow(0.5),
    resolutionDueAt: hoursFromNow(22),
    firstResponseAt: hoursAgo(0.8),
  });
  await insertMessages(
    orgId,
    case3,
    staffId,
    staffName,
    tenants.sofia.tenantId,
    "Sofia Khan",
    [
      {
        direction: "inbound",
        visibility: "tenant",
        channel: "phone",
        body: "Phone log: Tenant called reporting faint gas smell near cooker. Advised open windows, no switches, call 0800 111 999. Engineer attending.",
        author: "staff",
        hoursOffset: 0,
      },
      {
        direction: "outbound",
        visibility: "internal",
        channel: "app",
        body: "Escalate to duty manager. Confirm National Gas attendance and property isolation status.",
        author: "staff",
        hoursOffset: 0.2,
      },
    ],
    hoursAgo(1),
  );

  // 4 — Awaiting approval (rent)
  const case4 = await insertCase({
    orgId,
    reference: `${REF_PREFIX}004`,
    subject: "Request for rent payment extension",
    categoryId: cat("rent_payments"),
    status: "awaiting_approval",
    priority: "medium",
    source: "tenant_portal",
    tenantId: tenants.noah.tenantId,
    tenancyId: tenants.noah.tenancyId,
    propertyId: roseCourt,
    ownerUserId: staffId,
    createdByUserId: tenants.noah.tenantId,
    summary: "Tenant requesting 10-day extension on this month's rent.",
    unreadForStaff: false,
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(4),
    firstResponseDueAt: hoursAgo(16),
    resolutionDueAt: hoursFromNow(30),
    firstResponseAt: hoursAgo(20),
    nextActionAt: hoursFromNow(12),
  });
  await insertMessages(
    orgId,
    case4,
    staffId,
    staffName,
    tenants.noah.tenantId,
    "Noah Clarke",
    [
      {
        direction: "inbound",
        visibility: "tenant",
        channel: "tenant_portal",
        body: "I've had unexpected car repairs this month. Could I pay this month's rent 10 days late? Happy to confirm a new date in writing.",
        author: "tenant",
        hoursOffset: 0,
      },
      {
        direction: "outbound",
        visibility: "tenant",
        channel: "app",
        body: "Thanks Noah — I've raised this for manager approval and will confirm shortly.",
        author: "staff",
        hoursOffset: 4,
        deliveryStatus: "sent",
      },
    ],
    daysAgo(1),
  );
  await pool.query(
    `INSERT INTO communication_approvals (
       organization_id, case_id, type, requested_by, eligible_user_id, reason, created_at, updated_at
     ) VALUES ($1,$2,'manager_decision',$3,$3,'Approve 10-day rent extension for this period only',$4,$4)`,
    [orgId, case4, staffId, hoursAgo(4)],
  );

  // 5 — Awaiting tenant (access)
  const case5 = await insertCase({
    orgId,
    reference: `${REF_PREFIX}005`,
    subject: "Access needed for annual inspection",
    categoryId: cat("access"),
    status: "awaiting_tenant",
    priority: "medium",
    source: "app",
    tenantId: tenants.maya.tenantId,
    tenancyId: tenants.maya.tenancyId,
    propertyId: roseCourt,
    ownerUserId: staffId,
    createdByUserId: staffId,
    summary: "Awaiting tenant confirmation of access window next Tuesday.",
    unreadForStaff: false,
    unreadForTenant: true,
    createdAt: daysAgo(3),
    updatedAt: hoursAgo(10),
    firstResponseDueAt: daysAgo(2),
    resolutionDueAt: hoursFromNow(48),
    firstResponseAt: daysAgo(2),
    nextActionAt: hoursFromNow(24),
  });
  await insertMessages(
    orgId,
    case5,
    staffId,
    staffName,
    tenants.maya.tenantId,
    "Maya Patel",
    [
      {
        direction: "outbound",
        visibility: "tenant",
        channel: "email",
        body: "Hi Maya — we need access for your annual inventory inspection next Tuesday between 10:00–13:00. Please reply with confirmation or an alternative slot.",
        author: "staff",
        hoursOffset: 0,
        deliveryStatus: "delivered",
      },
      {
        direction: "outbound",
        visibility: "tenant",
        channel: "whatsapp",
        body: "Reminder: please confirm Tuesday access for your inspection.",
        author: "staff",
        hoursOffset: 48,
        deliveryStatus: "sent",
      },
    ],
    daysAgo(3),
  );

  // 6 — Overdue SLA (mould)
  const case6 = await insertCase({
    orgId,
    reference: `${REF_PREFIX}006`,
    subject: "Mould in bedroom corner",
    categoryId: cat("complaints"),
    status: "in_progress",
    priority: "high",
    source: "tenant_portal",
    tenantId: tenants.isabella.tenantId,
    tenancyId: tenants.isabella.tenancyId,
    propertyId: roseCourt,
    ownerUserId: staffId,
    createdByUserId: tenants.isabella.tenantId,
    summary: "Black mould on external wall — SLA overdue for resolution.",
    unreadForStaff: true,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(1),
    firstResponseDueAt: daysAgo(9),
    resolutionDueAt: daysAgo(2),
    firstResponseAt: daysAgo(8),
    nextActionAt: hoursAgo(12),
  });
  await insertMessages(
    orgId,
    case6,
    staffId,
    staffName,
    tenants.isabella.tenantId,
    "Isabella Green",
    [
      {
        direction: "inbound",
        visibility: "tenant",
        channel: "tenant_portal",
        body: "There's black mould spreading in the bedroom corner near the window. It's affecting my asthma.",
        author: "tenant",
        hoursOffset: 0,
      },
      {
        direction: "outbound",
        visibility: "tenant",
        channel: "app",
        body: "Sorry you're dealing with this — we've logged a damp survey and will update you once the contractor confirms a date.",
        author: "staff",
        hoursOffset: 24,
        deliveryStatus: "delivered",
      },
      {
        direction: "inbound",
        visibility: "tenant",
        channel: "tenant_portal",
        body: "Any update? It's getting worse and I'm worried about my health.",
        author: "tenant",
        hoursOffset: 9 * 24,
      },
    ],
    daysAgo(10),
  );
  await pool.query(
    `INSERT INTO communication_sla_events (
       organization_id, case_id, timer_type, deadline, escalation_level, created_at
     ) VALUES
       ($1,$2,'first_response',$3,0,$4),
       ($1,$2,'resolution',$5,1,$4)`,
    [orgId, case6, daysAgo(9), daysAgo(10), daysAgo(2)],
  );
  await pool.query(
    `INSERT INTO communication_actions (
       organization_id, case_id, title, description, assignee_id, due_at, status, required, sort_order
     ) VALUES ($1,$2,'Book damp survey','Chase contractor for confirmed slot',$3,$4,'open',true,0)`,
    [orgId, case6, staffId, hoursAgo(24)],
  );

  // 7 — Awaiting third party (noise)
  const case7 = await insertCase({
    orgId,
    reference: `${REF_PREFIX}007`,
    subject: "Noise complaint – neighbouring flat",
    categoryId: cat("complaints"),
    status: "awaiting_third_party",
    priority: "medium",
    source: "email",
    tenantId: tenants.oliver.tenantId,
    tenancyId: tenants.oliver.tenancyId,
    propertyId: parkView,
    ownerUserId: staffId,
    createdByUserId: staffId,
    summary: "Awaiting response from neighbouring landlord / council noise team.",
    unreadForStaff: false,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(1),
    firstResponseDueAt: daysAgo(4),
    resolutionDueAt: hoursFromNow(72),
    firstResponseAt: daysAgo(4),
  });
  await insertMessages(
    orgId,
    case7,
    staffId,
    staffName,
    tenants.oliver.tenantId,
    "Oliver White",
    [
      {
        direction: "inbound",
        visibility: "tenant",
        channel: "email",
        body: "Late-night noise from the flat above most weekends — music until 2am. Please investigate.",
        author: "tenant",
        hoursOffset: 0,
        deliveryStatus: "delivered",
      },
      {
        direction: "outbound",
        visibility: "tenant",
        channel: "email",
        body: "We've contacted the neighbouring managing agent and logged a diary request with the council noise team. We'll update you when we hear back.",
        author: "staff",
        hoursOffset: 12,
        deliveryStatus: "sent",
      },
    ],
    daysAgo(5),
  );

  // 8 — Resolved move-out
  const case8 = await insertCase({
    orgId,
    reference: `${REF_PREFIX}008`,
    subject: "Move-out checkout booking",
    categoryId: cat("move_out"),
    status: "resolved",
    priority: "low",
    source: "tenant_portal",
    tenantId: tenants.james.tenantId,
    tenancyId: tenants.james.tenancyId,
    propertyId: mayfair,
    ownerUserId: staffId,
    createdByUserId: tenants.james.tenantId,
    summary: "Checkout inspection booked and confirmed.",
    unreadForStaff: false,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(7),
    firstResponseDueAt: daysAgo(13),
    resolutionDueAt: daysAgo(8),
    firstResponseAt: daysAgo(13),
    resolvedAt: daysAgo(7),
    resolutionSummary: "Checkout booked for 3 Dec 10:00. Keys to be returned same day.",
  });
  await insertMessages(
    orgId,
    case8,
    staffId,
    staffName,
    tenants.james.tenantId,
    "James Miller",
    [
      {
        direction: "inbound",
        visibility: "tenant",
        channel: "tenant_portal",
        body: "I'd like to book a move-out checkout for early December please.",
        author: "tenant",
        hoursOffset: 0,
      },
      {
        direction: "outbound",
        visibility: "tenant",
        channel: "app",
        body: "Confirmed — checkout is booked for 3 Dec at 10:00. Please leave the property clean and return all keys.",
        author: "staff",
        hoursOffset: 24,
        deliveryStatus: "delivered",
      },
    ],
    daysAgo(14),
  );

  // 9 — Closed
  const case9 = await insertCase({
    orgId,
    reference: `${REF_PREFIX}009`,
    subject: "Wrong meter reading submitted",
    categoryId: cat("documentation"),
    status: "closed",
    priority: "low",
    source: "app",
    tenantId: tenants.amelia.tenantId,
    tenancyId: tenants.amelia.tenancyId,
    propertyId: mayfair,
    ownerUserId: staffId,
    createdByUserId: staffId,
    summary: "Corrected meter reading filed with supplier.",
    unreadForStaff: false,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(15),
    firstResponseDueAt: daysAgo(19),
    resolutionDueAt: daysAgo(16),
    firstResponseAt: daysAgo(19),
    resolvedAt: daysAgo(16),
    closedAt: daysAgo(15),
    resolutionSummary: "Correct reading sent to supplier; case closed.",
  });
  await insertMessages(
    orgId,
    case9,
    staffId,
    staffName,
    tenants.amelia.tenantId,
    "Amelia Reed",
    [
      {
        direction: "outbound",
        visibility: "tenant",
        channel: "app",
        body: "We've corrected the meter reading with your energy supplier. No further action needed from you.",
        author: "staff",
        hoursOffset: 0,
        deliveryStatus: "delivered",
      },
    ],
    daysAgo(20),
  );

  // 10 — Duplicate of boiler case
  const case10 = await insertCase({
    orgId,
    reference: `${REF_PREFIX}010`,
    subject: "Duplicate: boiler still cold",
    categoryId: cat("maintenance"),
    status: "duplicate",
    priority: "medium",
    source: "tenant_portal",
    tenantId: tenants.daniel.tenantId,
    tenancyId: tenants.daniel.tenancyId,
    propertyId: mayfair,
    ownerUserId: staffId,
    createdByUserId: tenants.daniel.tenantId,
    summary: "Duplicate of SEED-COM-002.",
    unreadForStaff: false,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    closedAt: daysAgo(1),
    resolutionSummary: "Merged into SEED-COM-002.",
  });
  await insertMessages(
    orgId,
    case10,
    staffId,
    staffName,
    tenants.daniel.tenantId,
    "Daniel Cole",
    [
      {
        direction: "inbound",
        visibility: "tenant",
        channel: "tenant_portal",
        body: "Still no heating — following up again.",
        author: "tenant",
        hoursOffset: 0,
      },
    ],
    daysAgo(1),
  );
  await pool.query(
    `INSERT INTO communication_case_links (
       organization_id, case_id, entity_type, entity_id, relationship
     ) VALUES ($1,$2,'case',$3,'duplicate_of')
     ON CONFLICT DO NOTHING`,
    [orgId, case10, case2],
  );

  // 11 — Internal-only arrears chase
  const case11 = await insertCase({
    orgId,
    reference: `${REF_PREFIX}011`,
    subject: "Internal: arrears chase – Noah Clarke",
    categoryId: cat("internal"),
    status: "in_progress",
    priority: "medium",
    source: "manual",
    tenantId: tenants.noah.tenantId,
    tenancyId: tenants.noah.tenancyId,
    propertyId: roseCourt,
    ownerUserId: staffId,
    createdByUserId: staffId,
    summary: "Internal tracking for arrears contact plan — not visible to tenant.",
    unreadForStaff: false,
    createdAt: daysAgo(4),
    updatedAt: hoursAgo(8),
    firstResponseDueAt: daysAgo(3),
    resolutionDueAt: hoursFromNow(96),
    firstResponseAt: daysAgo(3),
  });
  await insertMessages(
    orgId,
    case11,
    staffId,
    staffName,
    tenants.noah.tenantId,
    "Noah Clarke",
    [
      {
        direction: "outbound",
        visibility: "internal",
        channel: "app",
        body: "Opening arrears ~£1,100. Plan: soft reminder today, formal letter if no reply in 5 days. Linked to rent payment extension case.",
        author: "staff",
        hoursOffset: 0,
      },
      {
        direction: "outbound",
        visibility: "internal",
        channel: "app",
        body: "Called landline — no answer. Left voicemail. Next chase Friday.",
        author: "staff",
        hoursOffset: 48,
      },
    ],
    daysAgo(4),
  );
  await pool.query(
    `INSERT INTO communication_case_links (
       organization_id, case_id, entity_type, entity_id, relationship
     ) VALUES ($1,$2,'case',$3,'related'), ($1,$2,'property',$4,'related')
     ON CONFLICT DO NOTHING`,
    [orgId, case11, case4, roseCourt],
  );

  // 12 — Cancelled general enquiry
  const case12 = await insertCase({
    orgId,
    reference: `${REF_PREFIX}012`,
    subject: "Parking permit question (cancelled)",
    categoryId: cat("general"),
    status: "cancelled",
    priority: "low",
    source: "tenant_portal",
    tenantId: tenants.maya.tenantId,
    tenancyId: tenants.maya.tenancyId,
    propertyId: roseCourt,
    ownerUserId: null,
    createdByUserId: tenants.maya.tenantId,
    summary: "Tenant cancelled — resolved via building noticeboard.",
    unreadForStaff: false,
    createdAt: daysAgo(6),
    updatedAt: daysAgo(5),
    closedAt: daysAgo(5),
    resolutionSummary: "Cancelled at tenant request.",
  });
  await insertMessages(
    orgId,
    case12,
    staffId,
    staffName,
    tenants.maya.tenantId,
    "Maya Patel",
    [
      {
        direction: "inbound",
        visibility: "tenant",
        channel: "tenant_portal",
        body: "Where do I apply for a visitor parking permit?",
        author: "tenant",
        hoursOffset: 0,
      },
      {
        direction: "inbound",
        visibility: "tenant",
        channel: "tenant_portal",
        body: "Found it on the noticeboard — please cancel this request.",
        author: "tenant",
        hoursOffset: 20,
      },
    ],
    daysAgo(6),
  );

  // Property links for a few open cases
  for (const [caseId, propId] of [
    [case1, mayfair],
    [case2, mayfair],
    [case3, parkView],
    [case6, roseCourt],
  ] as const) {
    await pool.query(
      `INSERT INTO communication_case_links (
         organization_id, case_id, entity_type, entity_id, relationship
       ) VALUES ($1,$2,'property',$3,'related')
       ON CONFLICT DO NOTHING`,
      [orgId, caseId, propId],
    );
  }

  // Audit trail samples
  await pool.query(
    `INSERT INTO communication_audit_events (
       organization_id, case_id, actor_type, actor_id, event_type, after_json, created_at
     ) VALUES
       ($1,$2,'user',$3,'case_created',$4::jsonb,$5),
       ($1,$6,'user',$3,'case_assigned',$7::jsonb,$8),
       ($1,$9,'user',$3,'approval_requested',$10::jsonb,$11)`,
    [
      orgId,
      case1,
      staffId,
      JSON.stringify({ status: "new" }),
      hoursAgo(3),
      case2,
      JSON.stringify({ ownerUserId: staffId }),
      daysAgo(1),
      case4,
      JSON.stringify({ type: "manager_decision" }),
      hoursAgo(4),
    ],
  );

  // Keep document sequence ahead of seed refs so live COM-YYYY-##### won't clash
  const year = new Date().getFullYear();
  await pool.query(
    `INSERT INTO communication_document_sequences (organization_id, year, next_value)
     VALUES ($1, $2, 100)
     ON CONFLICT (organization_id, year)
     DO UPDATE SET next_value = GREATEST(communication_document_sequences.next_value, 100),
                   updated_at = NOW()`,
    [orgId, year],
  );

  const counts = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM communication_cases WHERE organization_id = $1 AND reference LIKE $2) AS cases,
       (SELECT count(*)::int FROM communication_messages m
          JOIN communication_cases c ON c.id = m.case_id
         WHERE c.organization_id = $1 AND c.reference LIKE $2) AS messages,
       (SELECT count(*)::int FROM communication_actions a
          JOIN communication_cases c ON c.id = a.case_id
         WHERE c.organization_id = $1 AND c.reference LIKE $2) AS actions,
       (SELECT count(*)::int FROM communication_approvals ap
          JOIN communication_cases c ON c.id = ap.case_id
         WHERE c.organization_id = $1 AND c.reference LIKE $2) AS approvals`,
    [orgId, `${REF_PREFIX}%`],
  );
  console.log("Seeded:", counts.rows[0]);
  console.log("Done. Open /communications as", STAFF_EMAIL);
  console.log("Demo tenants password: DemoTenant123!");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
