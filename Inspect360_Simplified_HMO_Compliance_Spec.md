# Inspect360 — Simplified HMO Compliance Specification

**Version:** 2.0 simplified | **Date:** 14 November 2026  
**Objective:** Upload an HMO licence against a property, extract its requirements, compare them with existing property records, show simple compliance results and alert on licence expiry or relevant regulatory changes.

## 1. Product scope

One **HMO** tab within each Inspect360 property, plus one **HMO Dashboard** across the portfolio. Reuse Inspect360's existing property, room, tenant/occupancy, inspection, compliance document, maintenance and notification records wherever possible.

**User journey:** Property > HMO tab > Upload licence PDF/image > AI extracts fields and licence-specific conditions > user confirms extracted details > system compares against verified property data > dashboard shows compliant / non-compliant / needs attention > alerts for renewals, evidence gaps and regulatory changes.

No new standalone case-management application, complex role matrix or separate reporting engine is required in this phase.

## 2. HMO tab — screen design

Top of screen: property address, borough, HMO licence status, date of expiry, occupants now / permitted, count of items needing attention.

Sections:
1. **Licence:** file preview/download, upload/replace licence, number, type, council, dates and holder.
2. **Restrictions:** total persons/households, permitted sleeping rooms, individual room restrictions and other captured conditions.
3. **Safety & evidence:** fire, gas, electrical, amenities and management conditions; linked evidence, last check, next due date and status.
4. **Alerts:** plain-English explanation, source, consequence/next action and optional link to existing Inspect360 work order or task.
5. **History:** uploaded licence versions, extracted fields, confirmations, assessments and reviewed rule changes.

Keep all sections on a single page with expandable detail. The user should not have to read the entire document to know which actions are needed.

## 3. Extracted fields

Every extracted field should store: **value, original document wording (where relevant), page/reference, extraction confidence, human confirmation flag, last updated**. The user can correct extracted values before assessment; preserve the original file and edit history.

| Group | Fields |
|---|---|
| Property | Licence property address, postcode, borough/issuing council, UPRN if stated; match to existing property record |
| Licence | Licence number, mandatory/additional/other scheme, issue date, effective/start date if expressly stated, expiry date, licence status if evidenced |
| Responsible parties | Licence holder, nominated manager/agent and relevant contact information if stated |
| Occupancy | Maximum permitted persons, maximum households if specified; relevant age restrictions |
| Rooms | Room identifier, designated use, licence-authorised occupants, dimensions/minimum floor area where stated, room-specific restrictions |
| Fire safety | Fire detection, door/escape route/emergency lighting requirements, fire-equipment checks, licence-specific intervals/deadlines |
| Gas/electrical | Required safety documents, servicing/testing intervals, licence-specific conditions |
| Facilities/management | Kitchens, bathrooms, toilets, ventilation, refuse, property maintenance, display and notification requirements |
| Other conditions | Every additional enforceable licence condition, effective dates, action/deadline, any referenced attachments/schedules |

Unknown is **null / Not specified**, never zero. If a schedule referenced in the licence is absent, mark **Missing document**.

Important: start/issue/grant/expiry dates are separate fields and should not be assumed interchangeable.

## 4. Comparing the licence to property records

Run checks on upload confirmation and whenever relevant underlying records change. Sources include the property profile, room records, current verified occupancy, inspection findings, documents and maintenance records.

| Check | Example | Output |
|---|---|---|
| Licence expiry | End date has passed, no verified replacement | **Needs attention:** verify current licensing/application position; do not automatically conclude unlawful operation |
| Upcoming renewal | Licence expiry within configured window (default 90/60/30 days) | **Renewal alert** |
| Property match | Address/UPRN mismatch | **Needs attention:** manual verification |
| Total occupancy | 7 confirmed occupants; licence maximum 6 | **Non-compliant:** confirmed mismatch, subject to authorised human review |
| Household limit | Verified household count exceeds a stated limit | **Non-compliant** if clearly applicable, otherwise review |
| Room allocation | Two occupants in a room licensed for one | **Non-compliant** if reliable and unambiguous |
| Room measurements | Measurements missing / below the applicable standard | **Needs attention** if missing; **Non-compliant** only when supported by verified dimensions and rules |
| Fire requirements | Licence requires service evidence, none on file | **Needs attention:** request evidence, not an automatically confirmed breach |
| Safety certificate | Relevant record known to have expired | **Needs attention** or **Non-compliant** only where a confirmed applicable obligation and reliable evidence establish breach |
| Missing licence schedule | Licence references attached schedule, none uploaded | **Needs attention:** upload missing schedule |
| New council rule | Approved new requirement potentially affects property | **Rules review alert**, not automatically non-compliant |

A check can be **Compliant**, **Non-compliant** or **Needs attention**. Separately show **Renewal due** and **Rules changed** alerts. Unknown evidence is never compliant. A property overall can display Compliant only when all applicable required checks have sufficient current evidence; otherwise Needs attention unless a confirmed non-compliant issue exists.

## 5. HMO dashboard — one simple portfolio view

Summary counters: **Total HMOs**, **Compliant**, **Non-compliant**, **Needs attention**, **Renewals due**, **Rules review needed**.

Filter/search: property name/address, borough, licence status, overall compliance status, property manager, renewal timeframe and alert type.

Recommended table columns: **Property | Borough | Expiry | Occupants / Allowed | Compliance | Alert count | Next action**. Clicking any row opens that property's HMO tab. Each alert must show why it is raised and what the user should do next.

For properties where occupancy is unknown, display **Unknown / 6**, not **0 / 6**.

Dashboard values are calculated from confirmed extraction, verified records and approved rules, not AI guesses.

## 6. Council regulations monitoring

A central background service (not an extra user-facing screen) maintains approved national and council HMO source URLs, local licensing schemes, enforceable requirements, source versions, date of effect, geography and type of property covered.

**Workflow:**
1. Check approved official council/GOV.UK/legislation sources periodically (suggest weekly) and record last successful check.
2. Detect changed documents, designation notices, conditions or standards.
3. AI produces a short proposed change summary, source URL and likely affected property types.
4. An authorised Inspect360 compliance administrator/reviewer verifies the rule's legal status, effective date and applicability before activating it. Distinguish enforceable conditions from guidance and consultations.
5. Reassess only potentially affected properties against the newly approved rule, applying any transitional provisions.
6. Show **Rules review needed** on affected property pages and portfolio dashboard, with the change, source, date and requested action.
7. Keep the uploaded licence immutable: new council rules never silently rewrite its text or expiry date.

If a source cannot be checked, show **Source not verified** internally; do not assume nothing changed.

**Important real-world example (Westminster, verified 14 Nov 2026):** Westminster's renewed borough-wide additional HMO licensing scheme runs from 31 August 2026 to 30 August 2031, but existing additional HMO licences remain valid until their individual expiry unless varied/revoked. A licensing scheme renewal therefore does not automatically invalidate every older licence.

Official sources:
- https://www.westminster.gov.uk/housing/private-sector-housing/houses-multiple-occupation-hmo/additional-licensing-scheme-renewal
- https://www.westminster.gov.uk/housing/private-sector-housing/houses-multiple-occupation-hmo/hmo-standards-and-further-information
- https://www.gov.uk/government/publications/houses-in-multiple-occupation-and-residential-property-licensing-reform-guidance-for-local-housing-authorities/houses-in-multiple-occupation-and-residential-property-licensing-reform-guidance-for-local-housing-authorities

## 7. Alerts and notifications

- **Licence renewal:** configurable alerts 90, 60, 30, 7 days before expiry, then past expiry. Dates configurable; they are operational reminders, not claimed statutory renewal deadlines.
- **Evidence:** when the platform cannot establish whether a licence condition is met.
- **Confirmed mismatch:** occupant count, room allocation, or another reliably evidenced breach of a clearly applicable requirement.
- **New rule:** a reviewed, applicable rule has changed and the property's evidence or arrangements need rechecking.
- **Document replaced:** recompute findings when a new licence is confirmed, while retaining old versions.

Notifications use existing Inspect360 in-app/email infrastructure. Support dismiss/snooze with reasons and keep a history of decisions; critical issues require a recorded reviewer decision before being resolved.

## 8. Minimum technical requirements

- Accept PDF and images; validate files, scan for malware and keep originals.
- OCR/extract all pages and referenced schedules; allow review/edit before saving.
- Store structured fields and condition records separately from the file; preserve source page citations and original text.
- Use **deterministic rules** for comparing dates, numeric limits and evidence states. Use AI for document extraction and readable explanations, not for final legal certification.
- Avoid duplicating property, tenant, room and compliance records already in Inspect360.
- Trigger reassessment on document replacement, occupancy/room change, new inspection/evidence, or approved applicable rule update.
- Audit field edits and rule approvals; enforce existing organisation/property permissions and GDPR controls.
- Reuse existing dashboard, alerts and task/work-order components.

Suggested lightweight data extensions only: **HMO licence**, **HMO extracted condition**, **HMO assessment/check**, **HMO alert**, **HMO rule/source version**. Link these to the existing property/document/inspection data model.

## 9. Delivery sequence

**Phase A — Licence intelligence:** HMO tab, upload, extraction, manual confirmation, conditions and dates, renewal alerts.

**Phase B — Property checks/dashboard:** compare live occupancy, room and safety records; three-state checks; searchable/filterable portfolio dashboard; missing-evidence alerts.

**Phase C — Council rule watcher:** central approved sources, change detection, human approval, scoped reassessment and rules-review notifications.

## 10. Acceptance criteria

1. A user uploads a Westminster sample licence and sees extracted borough, address, licence number, grant/start/expiry dates, occupancy limits, rooms, fire/safety conditions and page references.
2. A user can correct extraction mistakes before confirming.
3. Unknown room measurements or missing safety evidence show **Needs attention**, never an invented pass/failure.
4. Verified occupant count above a confirmed licence limit generates a clear mismatch.
5. Licence due to expire in 60 days creates a reminder; an expired uploaded document prompts licensing-status verification rather than automatically asserting illegal operation.
6. Dashboard counts reconcile with filtered properties and each issue links to the underlying record/source.
7. Changing a verified occupancy value updates only affected property results.
8. New approved council rules generate review alerts only for the applicable property cohort; guidance-only changes do not become automatic legal failures.
9. Existing licence documents and historical assessments remain viewable after replacement.
10. The whole ordinary workflow is completed on the existing property HMO tab and existing Inspect360 dashboard.

## 11. Out of scope for this simplified version

No stand-alone HMO case-management module, new inspector scheduling, new CRM entities, direct council submissions, automatic legal certification, automatic eviction/tenancy refusal, or autonomous AI publication of regulatory rules.
