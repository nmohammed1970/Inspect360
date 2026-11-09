# HMO Compliance — privacy & security checklist

- [ ] Org row-level filters on every `/api/hmo/*` query
- [ ] Module gate `hmo_compliance` ON before customer enablement
- [ ] Short-lived signed URLs for originals; content_hash stored separately from extraction JSON
- [ ] MIME + size limits enforced on uploads
- [ ] Evidence tokens hashed at rest; public page has no portfolio access
- [ ] Critical close requires `hmo.critical.close`
- [ ] Rule publish requires `hmo.rule.approve`; no auto-publish from web sources
- [ ] Occupant PII minimised in AI prompts; counts computed server-side
- [ ] Degrade paths never fake `VERIFIED_COMPLIANT` (model/source/email down)
- [ ] Audit events for confirm, assign, evidence decision, sign-off, rule approve
- [ ] Contabo migrations run as `creativecloud`; grants to `inspect360` only
