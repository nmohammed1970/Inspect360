# Inspect360 — Cursor Pro demo seeder implementation brief

Implement and test a reusable seed command in the existing repository. This is an implementation instruction, not an executable seed against an unknown schema. Do not create parallel modules or invent database columns. First inspect schema, migrations, ORM, tenancy isolation, services, storage, enums and existing seed conventions. Map the requirements below to actual models and report unsupported features. Use existing business services where safe. Do not run against production or send external communications.

## Safety and execution
- Require explicit demo organisation ID and demo environment flag; reject production and any organisation not explicitly marked demo. Default to dry run. Require --apply for writes. Disable outbound email, SMS, push, payment collection, webhooks and contractor notifications at transport level. Never import real tenant or agent personal details.
- Use deterministic seeded randomness (seed 3602026), stable external demo keys, transactions or resumable batches, and idempotent upserts. Tag every record with a seed batch via existing metadata or a separate manifest. Reset must delete only records owned by this seed in the specified demo organisation, in dependency order, after explicit confirmation. Preserve unrelated data.
- Use GBP integer pence or repository monetary type, Europe/London dates, UK address formatting. Anchor dates to run date or explicit --as-of. Generate a dry-run count, validation report and a post-run reconciliation report. Provide actual command syntax in repository README.

## Property source acquisition (50 unique London properties)
Research the following public Zoopla search pages manually or via a permitted/licensed data access method; do not bypass access restrictions, scrape against terms, or copy images without reuse permission. If the environment cannot browse, accept a manually curated CSV instead. Search for 2+ bedroom properties across Greater London. Prefer 10 East, 10 North, 10 South, 10 West, 10 Central. Aim for 30 flats, 15 houses, 5 maisonettes where available. Do not claim these properties are managed by Inspect360 or actually occupied by fictional tenants.
- https://www.zoopla.co.uk/to-rent/property/london/
- https://www.zoopla.co.uk/to-rent/flats/london/
- https://www.zoopla.co.uk/to-rent/property/se/
- https://www.zoopla.co.uk/to-rent/property/london/?beds_min=1&price_frequency=per_month

Create `demo-properties.csv` with source_listing_url, captured_at, address_line_1, address_line_2, town, county, postcode, country, bedrooms, bathrooms, property_type, monthly_rent_gbp, source_image_url, image_licence, approved_image_url, address_verified. Verify the full premise/unit and full postcode against a legitimately accessible address source; a district such as E15 is not a full postcode. Never guess missing house numbers or postcode suffixes. Reject duplicate addresses/listings. Where full address isn't available, choose another listing. Keep source images as provenance only unless permitted for reuse. Use approved licensed illustrative images instead if necessary, labelled illustrative. Do not attach fictional arrears, damage or safety complaints to real identifiable homes in externally shared demos: use clearly fictional display addresses for public-facing demonstrations, keeping source research private, or obtain permission. If 50 verified source records are unavailable, report the shortfall and stop strict import; an explicit --synthetic option may seed clearly labelled fictional addresses instead. Never silently substitute. 

Research examples observed on 27 Nov 2026 (partial addresses only; not import-ready): Tern Court, Binsey Walk SE2 (£2150, https://www.zoopla.co.uk/to-rent/details/74828199/); Stratosphere Tower E15 (£2800); Knightley Walk SW18 (£2850); Crockerton Road SW17 (£2750); Menotti Street E2 (£3100); Winchester Street W3 (£2400); Ruston Street E3 (£2300); Calla Court HA2 (£2300); Tegan Court SM2 (£1850); Dan Court NW10 (£2450); Milespit Hill NW7 (£1900); Crystal Palace Road SE22 (£2400). All require independent full-address and image verification.

## Tenants and rent
Generate exactly two adult synthetic tenants per property, 100 total. Use Faker en_GB or existing equivalent. Unique names and emails at example.com; mobile numbers only from UK Ofcom drama range 07700 900000–900999, formatted +44. Next of kin: synthetic name, relationship, distinct reserved phone and example.com email. No real identity documents or bank details. Link tenants to real schema occupancy/tenancy records. For joint tenancies use one agreement with two liable tenants and allocate payments to individual contributions (do not double charge whole rent). If schema supports separate room tenancies, use those only where appropriate. Two occupants alone do not make an HMO. Generate 12 monthly obligations per tenant (1,200 contribution obligations), dates within tenancy, with realistic shares adding to property rent. Across tenants: 80 consistently on time, 10 occasional late, 5 partial, 5 with current arrears. Create actual payment transactions only for money received; missed payments are unpaid obligations, not fake receipts. Include due date, paid date, amount, reference, simulated method, allocation and status. Reconcile balances and avoid future receipts. Do not invoke payment gateways.

## Inventory
Create 12–18 items per property (600–900 total). Include two beds, mattresses, bedside cabinets, lamps, sofa, microwave, dining table/chairs, fridge, washing machine, wardrobe and optional kettle, desk, TV. Link each to a room and property. Vary descriptions, colours, materials, model, acquisition date, original cost, condition and cleanliness. Typical illustrative costs: bed £150–650, sofa £250–1200, microwave £50–180, lamp £15–90, cabinet £35–150. Keep depreciation consistent with existing rules, never imply automatic tenant liability. Use a curated asset manifest of licensed images from Wikimedia Commons or other explicitly reusable sources, recording direct image URL, source page, licence and attribution. Obtain variants per category (target 8–15), shuffle deterministically; no identical inventory bundle across properties. Validate HTTP status, image MIME, size, and licence; use existing storage importer where permitted. Do not fabricate URLs or use random unrelated images. If assets are missing, report them and use clearly labelled local placeholders only with explicit fallback flag. Do not download from arbitrary hosts without SSRF-safe allowlist, timeout and byte cap.

## Maintenance: 30 tenant-originated requests
Use 30 distinct properties, selecting an actual assigned tenant per request. Create realistic initial messages, timestamps, categories, priorities, status history, contractor assignment and appointment where appropriate. Amounts below are illustrative GBP net quote totals, not actual market quotations. Create 20 quotations for rows marked with a price; accepted quotes are required before quote-dependent work progresses. Completed jobs have resolution notes and timestamps. Emergency cases route immediately to review, not held pending quotation. Use existing priority/status enums and valid transitions.

| # | Issue | Status | Net quote |
|---|---|---|---:|
|1|Boiler no heating|Assigned|180|
|2|Kitchen tap dripping|Quote awaiting approval|95|
|3|Shower drain blocked|Completed|85|
|4|Bedroom damp patch|Urgent assessment|—|
|5|Washing machine not draining|Quote awaiting approval|120|
|6|Broken wardrobe hinge|Completed|65|
|7|Front door lock sticking|Assigned|145|
|8|Fridge not cooling|Quote awaiting approval|280|
|9|Bathroom extractor failed|Scheduled|160|
|10|Water leaking through ceiling|Emergency triage|—|
|11|Hallway light flickering|Scheduled|95|
|12|Toilet cistern running|Completed|110|
|13|Window seal draught|Quote awaiting approval|125|
|14|Loose kitchen cupboard|Completed|60|
|15|Oven not heating|Assigned|155|
|16|Smoke alarm fault|Urgent assessment|—|
|17|Radiator cold|Scheduled|90|
|18|Carpet trip hazard|Quote awaiting approval|190|
|19|Shower screen leaking|Completed|115|
|20|Broken intercom|Assigned|175|
|21|Pest sighting|New|—|
|22|Microwave broken|Quote awaiting approval|90|
|23|Sofa leg broken|Completed|75|
|24|Fence panel damaged|Scheduled|220|
|25|Bath silicone deteriorated|Completed|85|
|26|Low water pressure|New|—|
|27|Communal door not closing|Urgent assessment|—|
|28|Condensation concern|Under review|—|
|29|Loose socket|Urgent assessment|—|
|30|Missing bin lid|New|—|

Rows 1–25 contain 21 quoted scenarios: choose 20 by omitting the quote on row 14 and treating it as an internal minor repair. Correct count explicitly in validation. For priced quotes provide labour/materials/call-out line items summing to net, VAT only where simulated contractor is VAT registered, gross totals, quote validity, status and supplier contact. Link to maintenance and property; record no real invoices or external bookings. For gas/electrical/water hazards use review and safe escalation notes, with no false claims of compliance.

## CRM contacts (60)
Create 12 landlords, 8 plumbers/heating engineers, 6 electricians, 4 decorators, 4 cleaners, 4 general maintenance contractors, 3 locksmiths, 3 inventory clerks, 3 letting agents, 2 surveyors, 2 pest control providers, 2 waste contractors, 2 insurance brokers, 2 solicitors, 2 fire safety assessors and 1 lift engineer. All fictional names and companies, reserved phones, example.com emails. Populate contact role, organisation, service region, preferred contact channel, notes and relevant property associations where supported. Reuse these contractors in maintenance quotes and assignments. No fake credentials represented as valid.

## Optional demo depth (enable via --extended)
150 communications (rent questions, repair updates, access requests), 250 compliance tracking records where applicable, 100 historical and 20 scheduled inspections. Compliance documents must be visibly SAMPLE and must not mimic authentic signed certificates. Include due soon, overdue and missing evidence states based on appropriate property requirements, not invented legal obligations. Historical inspections and comparison evidence must be clearly simulated and linked to inventory. Use tenant-led inspections and reminders only as stored events, never dispatch. Do not imply actual faults at sourced addresses. Implement only supported modules and report deviations.

## Acceptance tests
1. Exactly 50 unique properties / 100 tenants / two active occupants each / 100 next-of-kin links; tenancy count reflects actual agreement model.
2. Exactly 1,200 monthly tenant contribution obligations for full-year tenancies; receipts and balances reconcile to penny, no double rent.
3. 600–900 inventory records, every item linked to correct property/room; image validation report and provenance.
4. 30 requests attributed to assigned tenants; exactly 20 linked quotes with correct line totals and valid status histories.
5. Exactly 60 CRM contacts, contractor links resolve; no real contact channels.
6. Run twice, counts unchanged. Cross-organisation writes impossible; dry run performs no domain writes. Reset preserves all unrelated records.
7. Open actual property detail, tenant portal, Rent Manager, inventory, maintenance and Contacts screens and verify records display correctly. Produce screenshots if local test tooling supports them; report unsupported screens honestly.
8. Report source coverage, missing full addresses, image rights/availability, actual inserted counts, skipped items, errors, and commands. Never mark the task complete on unverified data.
