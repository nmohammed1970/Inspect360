# HMO portfolio scale notes (AT-20)

Target: ~10k HMO properties per organisation.

- Prefer `preAggregateDashboardMetrics` / status bucket counts over scanning all findings client-side
- Bulk licence import is idempotent by `content_hash`
- Assessment jobs remain in-process through P3; introduce durable queue if extract/assess latency exceeds SLA under load
- Index coverage: property profiles by org, licences by org+property+expiry, findings by assessment, cases by org+status
- Load test checklist: dashboard p95, concurrent uploads, reassessment fan-out for selective impact cohorts only
