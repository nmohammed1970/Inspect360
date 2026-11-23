# Open decisions — Maintenance Quotes & Invoicing

**Scope:** Starts at an **existing Work Order**. Request triage / WO creation out of scope.

**Canonical flow:**  
WO → draft quote → submit → owner approve → **secure-link** customer decision → convert to customer invoice → **record received payments**.

---

## Resolved (do not reopen)

| ID | Decision |
|---|---|
| Entry point | Existing work order only |
| OD-01 | Recipient = contact **or** manual snapshot |
| OD-02 | Owner approve then customer accept (independent) |
| **OD-03** | **No offline/phone customer approval.** Decisions only via secure link. |
| **OD-04** | **Hashed-token public quote link** (expire + revoke); no customer login |
| **OD-06** | Quote gate for **newly created** WOs only; existing WOs not blocked; no historical backfill/auto-delete; protect WO/request delete when quotes/invoices exist |
| **OD-07** | Currency = `organizations.preferred_currency`; snapshot on each quote/invoice; no per-document picker |
| **OD-08** | **Per-line tax in quote builder** (preset %, Exempt, 0%/zero-rated, Other/custom %); store type/rate/label on line; no org-wide tax admin module |
| Payments | Simple received-payment records only (not a finance system) |
| Owner self-approve | Allowed; distinct audited action before send |

### OD-03 / OD-04 detail

- Customer Accept / Decline / Request changes **only** on `/public/…` token page.  
- Owner is notified (email/events) and may revise → resubmit → re-approve → resend.  
- Tokens: store hash only; expiry; revoke on resend/decision.  
- **No** `record-customer-decision` / offline override API or UI.

### OD-06 detail

- Additive `authorisation_status`: existing rows `not_required`; new WO inserts `quote_required`.  
- No complicated historical migrations.  
- Historical WOs without finance docs keep existing delete behaviour.  
- WOs **with** quotes/invoices: refuse accidental delete.

### OD-07 detail

- Inherit org preferred currency at document create; persist on header; use in maths, UI, PDF, email.

### OD-08 detail

- Line tax dropdown examples: common percentages (e.g. 5, 10, 15, 20), Exempt, 0% / Zero-rated, Other (custom %).  
- Persist `tax_type`, `tax_rate` (or bp), `tax_label` on each line; recompute line tax + document totals server-side.  
- Convert-to-invoice copies tax fields.  
- **No** `maintenance_tax_rates` CRUD / Settings tax module unless a tiny shared constant list of presets is needed in code (not a DB admin UI).

---

## Still unresolved

### OD-09 — Private finance file serving

Feature-scoped authorised downloads for quote/invoice PDFs (current object ACL is public-prone). Recommended: private serve routes. **Blocks** Phases 02–03, 05.

### OD-11 — Customer invoice delivery channel

Email+PDF only vs also a public invoice token link. **Blocks** Phase 05 polish only.

### OD-13 — Contractor AP invoices

Separate from customer invoices; not in these 7 phases unless product expands. **Do not** conflate.

### OD-14 — Appointments after authorisation

Out of this project recommended.

### OD-15 — New owner completion-review stage

Keep existing checklist/signature recommended.

### OD-16 — Pre-auth / skip-quote rules

Default: every new WO requires customer-accepted quote. Rules engine later if needed.

---

## Suggested order for remaining items

1. **OD-09** before shipping PDFs/attachments.  
2. **OD-11** during Phase 05.  
3. **OD-13–16** do not block core quote→invoice→payment build if defaults above are accepted.
