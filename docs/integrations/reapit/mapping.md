# Field mapping

## Property (`GET /properties/{id}`) → `properties`

- `id` → `reapit_entity_mappings` (`property`)
- formatted address (building + lines + postcode) → `address`
- `id` or building name + address line → `name`
- `type` / letting style → `propertyType` (lowercase string)
- first property image URL → skipped in v1 (optional later; extra billed embed not used)
- landlord related contact → `landlordContactId` after landlord upsert
- lettings filter: `marketingMode === "letting"` OR `letting` object present; skip sales-only

## Contact (`GET /contacts/{id}`) → `contacts` (+ tenant `users` when used on a tenancy)

- `id` → mapping (`contact`)
- `forename`/`surname` → `firstName`/`lastName` (fallback "Unknown")
- `email` → `contacts.email`
- mobile/home phone → `phone`
- primary address → contact address fields
- Tenant user: same org + email match → link; else unique `reapit+{id}@noreply.inspect360.local` if email taken globally; `hasPortalAccess=false`

## Landlord (`GET /landlords/{id}`) → `contacts` type `landlord`

- related contacts merged into one primary contact mapping (`landlord`)

## Tenancy (`GET /tenancies/{id}`) → `tenant_assignments`

- `id` → mapping (`tenancy`)
- `propertyId` → mapped property (fetch property first if missing)
- related tenant contact → tenant user + assignment
- start/end → `leaseStartDate` / `leaseEndDate`
- rent amount / frequency monthly → `monthlyRent`
- deposit → `depositAmount`
- ended/cancelled status → `isActive=false`
- then `generateRentPeriodsForAssignment`

Ended Reapit tenancies are deactivated, never hard-deleted. Properties are never deleted from Reapit archive events.
