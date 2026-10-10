# Reapit webhook events

| Topic | Action |
| --- | --- |
| `application.install` | Mark matching connection connected |
| `application.uninstall` | Disable connection, drop tokens, keep Inspect360 data |
| `properties.created` / `properties.modified` | Fetch property and upsert if lettings-relevant |
| `contacts.created` / `contacts.modified` | Upsert contact |
| `landlords.created` / `landlords.modified` | Upsert landlord as `contacts.type=landlord` |
| `tenancies.created` / `tenancies.modified` | Ensure property then tenancy; `tenancies.write` is required by Reapit for this topic |

Organisation is resolved from payload `customerId` / subscription customer, never from a request header.
Duplicate `eventId` returns 200 without a second job.
