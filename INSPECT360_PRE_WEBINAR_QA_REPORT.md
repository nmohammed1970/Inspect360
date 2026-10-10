# Inspect360 Pre-Webinar QA Report

**Audit date:** 6 October 2026  
**Scope:** Codebase + existing unit tests + local HTTP probe  
**Code changes in this audit:** none (findings reported only)

---

## 1. Executive Summary

Overall status: **PASS WITH ISSUES**

**Final recommendation: READY WITH MINOR FIXES** for a **controlled, single-organisation web demo** on a known-good account (login → dashboard → property → inspection → photos → report).

**Not ready** to claim “the entire system is fully tested” or to rely on:

- Multi-org isolation (confirmed IDOR on several GET APIs)
- Mobile inspection photo upload on Expo 57 (fragile FormData path)
- Reapit Connect (app credentials still empty locally; Contabo env must be set separately)
- Stripe webhook correctness (registered path vs raw-body skip mismatch)
- Live browser/console walkthrough of every page (local server was **not running** during this audit)

No production configuration was changed. No database data was changed. No secrets are printed in this report.

---

## 2. System Overview

### Web

- **Frontend:** Vite 5 + React 18 (`client/`), Wouter routing (`client/src/App.tsx`), TanStack React Query, cookie sessions (`credentials: "include"`).
- **Roles (org users):** `owner`, `clerk`, `compliance`, `tenant`, `contractor` (`shared/schema.ts`).
- **Platform admin:** separate `admin_users` + `req.session.adminUser` (not in `userRoleEnum`).

### Mobile

- Expo SDK 57 / React Native (`mobile/`), cookie session (no bearer tokens), SQLite offline for inspections, camera/image-picker, no OS push notifications.
- API URL: `EXPO_PUBLIC_API_URL` → fallback `https://portal.inspect360.ai`. EAS development/preview/production profiles currently bake the production portal unless overridden.

### Backend

- Express 4 monolith (`server/index.ts`, default port **5005**).
- Almost all APIs in `server/routes.ts` (~36k lines), plus `auth.ts`, `creditRequestRoutes.ts`, `adminPasswordResetRoutes.ts`, `reapitRoutes.ts`.
- Auth: Passport-local + `express-session` + PostgreSQL session store (`inspect360.sid`, 7-day rolling, `secure` when `NODE_ENV=production`).
- Entitlements: trial/credits lock listed prefixes (`shared/entitlements.ts`) inside `isAuthenticated`.

### Database

- PostgreSQL + Drizzle (`shared/schema.ts`, `server/storage.ts`).
- Isolation is **application-level** (`organizationId` checks), not Postgres RLS.

### External services

| Service | Role | Notes |
| --- | --- | --- |
| Resend | Email | Password reset, notifications |
| TextMagic | SMS | Tenant SMS; org-configurable |
| Stripe | Payments | Self-serve checkout largely `SELF_SERVE_DISABLED`; webhooks exist |
| OpenAI (via env base URL) | Vision, write-up, chat, Whisper | Mix of `gpt-5` and `gpt-4o` |
| Local object storage | Files/photos | `LOCAL_STORAGE_DIR`; GCS package unused |
| Fixflo | Maintenance CRM | Optional; webhook org from body/header |
| Reapit | Lettings CRM sync | One-way; OAuth + DB worker |
| Google Maps | Address UI | Key served by public API |
| WebSocket `/ws` | In-app notifications | Cookie-based |

**Jobs:** in-process `setInterval` (no Redis). Rent hourly, entitlement notices hourly, Reapit worker ~5s, monthly credit reset off by default.

**Deploy:** Contabo Docker + Caddy (`portal.inspect360.ai` / `dev.inspect360.ai`).

---

## 3. Endpoint Audit

- **Total endpoints found:** ~525 production handlers (~520 unique method+path) + 3 `/api/dev/*` (development only).
- **Endpoints runtime-tested this session:** **0 authenticated**; local `http://127.0.0.1:5005` was **not reachable**.
- **Unauthenticated probe:** failed (connection refused) — server not up.
- **Code-reviewed:** all route families in `server/*.ts`; unit tests for entitlements, password reset, work-order access, Reapit mappers/crypto/webhooks, rent math, credits.
- **Passed (unit tests, this session):** password policy, entitlements, rent math, credit requests, inspection notes, work-order certificates, entitlement notifications, billing tiers, password reset service, work-order access (all 0 failed where completed).
- **Failed (runtime HTTP):** local health/auth/login — **Cannot be tested** (server down).
- **Not testable without demo accounts + running app:** CRUD, PDFs, uploads, Stripe, SMS, email, Reapit OAuth, mobile device.

### Representative inventory

| Method | Endpoint | Feature | Auth | Result | Severity | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/health` | Ops | Public | **Not verified — server down** | — | Used by Docker healthcheck |
| POST | `/api/login` | Auth | Public | **Not verified — server down** | — | Web + mobile |
| POST | `/api/logout` | Auth | Public | Code review only | — | |
| GET | `/api/auth/user` | Session | isUserOrAdmin | **Not verified — server down** | — | |
| POST | `/api/forgot-password` | Auth | Public | Unit tests for helpers **passed** | — | Generic success message in service tests |
| POST | `/api/reset-password` | Auth | Public | Unit tests **passed** | — | |
| GET | `/api/properties/:id` | Properties | isAuthenticated | **Verified failing (code)** | **HIGH** | **No org check** — IDOR |
| PATCH | `/api/properties/:id` | Properties | owner/compliance | Code OK | — | Org checked |
| GET | `/api/blocks/:id` | Blocks | isAuthenticated | Code OK | — | Org checked |
| GET | `/api/blocks/:blockId/properties` | Blocks | isAuthenticated | **Verified failing (code)** | **HIGH** | **No org check** (earlier duplicate-style route) |
| GET | `/api/inspections/:id` | Inspections | isAuthenticated | Code OK | — | Org + clerk assignment + tenant rules |
| GET | `/api/inspection-entries/:id` | Inspections | isAuthenticated | **Verified failing (code)** | **HIGH** | Org presence checked; **entry not bound to org** |
| POST | `/api/ai/inspect-field` | AI | isAuthenticated | Code review only | **HIGH** | Unbounded photos; `gpt-5`; not credit-gated per call |
| POST | `/api/objects/upload-direct` | Uploads | isAuthenticated | Code review only | **HIGH** | Mobile inspection still uses fragile FormData |
| POST | `/api/billing/webhook` | Stripe | Public | **Verified failing (code)** | **HIGH** | Raw-body skip is `/api/webhooks/stripe` (no handler) |
| POST | `/api/webhooks/reapit` | Reapit | Public | Code OK | — | Raw body + Ed25519 verify |
| POST | `/api/integrations/fixflo/webhook` | Fixflo | Public | Code review | **HIGH** | Org from body/`x-organization-id`; token optional |
| GET | `/api/config/google-maps-key` | Maps | Public | Code review | **MEDIUM** | Exposes server Maps key |
| POST | `/api/dev/create-test-user` | Dev | Public in dev | Code review | **MEDIUM** | Blocked when `NODE_ENV=production`; returns plaintext password |
| GET | `/api/reapit/connection` | Reapit | owner/clerk | Code review | **INFO** | UI disables Connect if `REAPIT_CLIENT_ID` empty |
| GET/POST | `/api/admin/*` | Eco-admin | Mixed | Code review | **HIGH** | Large catalog uses org `isAuthenticated` + email in `admin_users`, not `isAdminAuthenticated` |

Full ~525-path dump omitted for readability; families: auth, org, properties, blocks, inspections, AI, comparison, tenants, maintenance, work orders, compliance, assets, billing/credits, marketplace, reports/PDF, notifications, community, Fixflo, Reapit, objects/uploads, eco-admin.

**Do not invent runtime pass/fail for endpoints that were not executed.**

---

## 4. Web Application Results

| Module | Result | Issues | Severity |
| --- | --- | --- | --- |
| Architecture / routing | Code-complete | Field roles redirected off dashboard/settings | INFO |
| Authentication | Code + unit tests | Runtime login **not verified** (server down) | — |
| Dashboard | **Not verified — requires browser** | — | — |
| Properties | Partial (code) | GET by id IDOR | HIGH |
| Inspections | Partial (code) | Entry GET IDOR; capture/AI cost | HIGH |
| Photos / objects | Partial (code) | ACL public on many uploads | MEDIUM |
| Inspection / comparison / portfolio / history PDFs | Code present | **Not verified — requires runtime** | — |
| Tenants / portal | Partial (code) | Portal access off for Reapit-synced tenants | INFO |
| Maintenance / work orders | Partial (code + unit tests for access helper) | **Not verified — requires browser** | — |
| Compliance | Partial (code) | **Not verified — requires browser** | — |
| Rent / expenses / deposits | Partial (code) | Hourly worker; **not verified in UI** | — |
| Reports hub | Code present | **Not verified — requires browser** | — |
| Notifications | Code + WebSocket | **Not verified — requires browser** | — |
| Settings / Fixflo / Reapit | Code present | Reapit Connect disabled without client id (expected) | INFO |
| Admin portal | Partial (code) | Wrong guard on many `/api/admin/*` catalog routes | HIGH |
| Search/filter/pagination | Code present | **Not verified — requires browser** | — |
| Responsiveness | **Not verified — requires browser** | — | — |
| Console / network | **Not verified — requires browser** | Local server down | — |

---

## 5. Mobile Application Results

| Module | Result | Issues | Severity |
| --- | --- | --- | --- |
| Framework / nav | Code-complete | Ops vs tenant stacks | INFO |
| Auth / cookies | Code review | Cookie sessions; biometric stores **plaintext password** in SecureStore | HIGH |
| Session persistence | Code review | **Not verified on device** | — |
| Inspections | Code review | FormData upload path vs Expo 57-safe uploader used on Profile | HIGH |
| Camera / photos | Code review | Dual upload stacks; File API may omit cookies | HIGH |
| Offline SQLite | Code present | Inspections only; background fetch declared but unused | MEDIUM |
| Push | Not implemented | In-app poll + WS | INFO |
| EAS API URL | Code review | Dev/preview profiles default to **production** portal | MEDIUM |
| Device UI (keyboard, safe area, orientation) | **Not verified — requires device** | — | — |

---

## 6. Authentication & Authorization

### Verified (unit / code)

- Password policy: minimum **6** characters (`shared/passwordPolicy.ts`) — tests passed.
- Reset helpers: generic success, expiry, hashing (`server/passwordResetService.test.ts`) passed.
- Entitlement prefix locks include `/api/reapit` and exclude `/api/webhooks/reapit` — tests passed.
- Inspection GET enforces org for staff and extra rules for clerks/tenants.
- Property PATCH/DELETE and block GET enforce org.

### Verified failing (code)

- `GET /api/properties/:id` — any logged-in user who knows a UUID can read another org’s property.
- `GET /api/blocks/:blockId/properties` — same class of IDOR.
- `GET /api/inspection-entries/:id` — returns entry without joining inspection org.

### Not verified (needs running server + accounts)

- Valid/invalid login, logout, session cookie on HTTPS, multi-session, forgot/reset email delivery, change password UI, role matrix in the browser, tenant vs owner UI redirects.

### Role model (code)

| Role | Typical access |
| --- | --- |
| owner | Full org product + Settings/Integrations/Billing |
| clerk / contractor | Inspections, maintenance, work orders, assets; redirected off dashboard/settings |
| compliance | Properties/blocks/compliance/reports; not inspections/maintenance nav |
| tenant | Tenant portal only |
| eco-admin | Separate login `/admin/login` |

**Wrong-role API denial:** mixed — many reads are any authenticated org member; many writes use `requireRole`. Community uses inline checks.

---

## 7. Security Findings

| # | Problem | Why it matters | Severity | Location | Recommended fix |
| --- | --- | --- | --- | --- | --- |
| S1 | Property GET has no org check | Cross-org data leak if UUID guessed/leaked | HIGH | `server/routes.ts` `GET /api/properties/:id` | Match PATCH: 403 if `property.organizationId !== user.organizationId` |
| S2 | Block properties GET has no org check | Cross-org property list | HIGH | `server/routes.ts` `GET /api/blocks/:blockId/properties` | Load block, compare org, then list |
| S3 | Inspection entry GET has no org bind | Cross-org notes/photos metadata | HIGH | `server/routes.ts` `GET /api/inspection-entries/:id` | Load parent inspection; compare org |
| S4 | Stripe webhook path mismatch + unverified fallback | Forged billing events if secret/sig missing | HIGH | `server/index.ts` skip `/api/webhooks/stripe`; handler `POST /api/billing/webhook` | Skip JSON parser for `/api/billing/webhook`; reject when secret set but body not raw/verified; never accept unsigned in production |
| S5 | Fixflo webhook trusts client org id; token optional | Inject issues into another org if token unset | HIGH | `server/routes.ts` `POST /api/integrations/fixflo/webhook` | Bind org from stored subscription only; require verify token |
| S6 | Eco-admin catalog on org session + email match | Org user whose email is also an eco-admin can hit catalog APIs without admin session | HIGH | `server/routes.ts` `/api/admin/plans` etc. | Use `isAdminAuthenticated` only |
| S7 | Public Google Maps key endpoint | Key harvesting, billing abuse | MEDIUM | `GET /api/config/google-maps-key` | Restrict referrer + authenticated config |
| S8 | CORS: missing Origin in prod still `Allow-Credentials: true` with `*` | Spec-invalid; risky if a browser omits Origin | MEDIUM | `server/index.ts` | Never send `*` with credentials |
| S9 | Rich text `dangerouslySetInnerHTML` | Stored XSS if HTML not sanitised | MEDIUM | `client/src/components/ui/rich-text-editor.tsx` | DOMPurify before render |
| S10 | Password min length 6 | Weak passwords on demo/prod | MEDIUM | `shared/passwordPolicy.ts` | Raise to 10+ (breaking for existing short passwords — **do not change on webinar day**) |
| S11 | Dev seed routes return plaintext password | Fine in true dev; dangerous if `NODE_ENV` mis-set | MEDIUM | `server/devRoutes.ts` | Keep production block; avoid logging |
| S12 | Mobile biometric stores real password | Device backup / malware = account takeover | HIGH | `mobile/src/contexts/AuthContext.tsx` | Device-bound token, not password (not a webinar-day refactor) |

**Secrets scan:** no `sk_live` / OpenAI keys in committed TS. Secrets live in `.env` (local) and Contabo env files — **do not commit**. `.env` is gitignored.

**SQL injection:** Drizzle parameterized queries are the norm; SKIP LOCKED Reapit SQL is static.

**Destructive attacks were not performed.**

---

## 8. Performance Findings

| Finding | Severity | Notes |
| --- | --- | --- |
| `routes.ts` is a single huge module | MEDIUM | Cold start / maintainability; webinar impact low if process already warm |
| AI inspect-field sends **all** photos as full data URLs on one `gpt-5` call (`max_output_tokens: 10000`) | HIGH | Demo with many photos → timeout, cost, or failure |
| Full-inspection analyse loops every photo-bearing entry | HIGH | Same |
| Transcribe-base64 JSON limit 35MB | MEDIUM | Whisper 25MB; base64 inflation |
| No pagination called out on some admin/list APIs | MEDIUM | Large orgs only |
| In-process workers (Reapit every 5s) | LOW | Fine for webinar; log noise if tables missing |
| Duplicate React Query fetches | **Not verified — requires browser** | — |

---

## 9. AI Audit

**Do not change models for this audit (no Sol → Terra swap).**

| Item | Current |
| --- | --- |
| Client | `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` via `getOpenAI()` in `server/routes.ts` |
| Primary inspection vision / write-up | **`gpt-5`** (hardcoded comments in `routes.ts`) |
| Chat, Ivy, maintenance analyse, certificates | **`gpt-4o`** / **`gpt-4o-mini`** |
| Speech | **`whisper-1`** |
| Image input | Server loads `/objects/...` → data URLs; inspect-field does **not** use HEIC conversion (`imageForAi.ts` is used on maintenance analyse) |
| Output storage | Inspection entry **notes**; `ai_image_analyses` for `/api/ai-analyses`; chat tables |
| Retry | Inspect-field: 60s race, 3 retries on connection errors; client 120s for `/ai/` URLs |
| Credits | Comments indicate deduction on **inspection complete**, not per analyse — cost risk |
| Later Terra test | Possible by changing model strings + verifying proxy aliases; **not done** |

**Webinar risk:** if the OpenAI proxy does not serve `gpt-5`, inspection write-up / photo analyse fails while chat may still work on `gpt-4o`.

---

## 10. Critical Issues

Must address **before** a public multi-org or mobile-heavy webinar. For a **single-org web-only demo**, treat as HIGH but not necessarily blockers:

1. **IDOR** on property GET, block properties GET, inspection entry GET.
2. **Stripe webhook** cannot verify signatures correctly with the current raw-body skip path (billing demo / live payments).
3. **Mobile inspection uploads** may throw `Unsupported FormDataPart` on Expo 57 (if mobile is in the demo).
4. **AI inspect-field unbounded images + `gpt-5`** (if AI write-up is in the demo).
5. **Runtime not verified** this session — start the app and run the webinar checklist below on the **actual demo host**.

Fixflo/Reapit are **not** critical unless those slides are in the script. Reapit Connect stays disabled until `REAPIT_CLIENT_ID` / secret are set and the app restarted.

---

## 11. Recommended Fixes

| Problem | Why | Fix | Risk of fixing | Priority |
| --- | --- | --- | --- | --- |
| IDOR on three GET routes | Data leak | Add org checks copied from sibling handlers | **Low** for legitimate same-org demo | P0 after webinar or immediately if multi-tenant audience |
| Stripe skip path | Payments/webhooks | Align `index.ts` skip with `/api/billing/webhook`; fail closed in production | **Medium** (must retest Stripe) — **do not ship mid-webinar** | P0 post-webinar unless billing is demoed live |
| Fixflo webhook org header | Injection | Require token; ignore client org | Medium | P1 if Fixflo not demoed |
| Admin API guards | Privilege mix-up | `isAdminAuthenticated` only | Medium (eco-admin UI) | P1 |
| Mobile FormData | Crash on capture | Reuse `objectUpload.ts` on FieldWidget/sync | Medium (test on device) | P0 if mobile demo |
| Biometric password storage | Account takeover | Don’t fix on webinar day | High product change | P2 |
| Unbounded AI photos | Timeout/cost | Cap e.g. 4 images; JPEG convert | Low–medium | P0 if AI demo |
| Maps key public | Billing | Restrict | Low | P2 |
| Password length 6 | Weak auth | Don’t change on webinar day | Breaking | P2 |

---

## 12. Webinar Demo Checklist

Run on the **demo environment** (likely `https://portal.inspect360.ai` or `https://dev.inspect360.ai`), not only local.

**Environment**

- [ ] Target host reachable; `/api/health` returns `{ ok: true }`
- [ ] Database up; no repeated `relation "…" does not exist` in logs
- [ ] Env: `SESSION_SECRET`, `DATABASE_URL`, Resend, OpenAI, storage dir
- [ ] `NODE_ENV=production` only behind HTTPS (Caddy). Local demo: `npm run dev` (forces development cookies)
- [ ] Reapit: skip slide unless client id/secret set and Connect enabled
- [ ] Fixflo: skip unless token + URL tested
- [ ] Credits/trial on demo org **not expired** (entitlement lock would 403 inspections/properties)

**Accounts (use existing demo users — do not create random prod data)**

- [ ] Owner login
- [ ] Clerk/inspector login (if demoing field capture)
- [ ] Tenant login (if demoing portal)
- [ ] Logout / re-login once

**Critical path**

- [ ] Dashboard loads; no red console errors
- [ ] Open a **known** property (do not type another org’s id)
- [ ] Property tabs: tenants, inspections, compliance
- [ ] Create or open inspection; add a field note
- [ ] Upload **1–2 small** photos (web); confirm they render
- [ ] Save inspection; complete if that is the script
- [ ] Open inspection report; generate PDF once (allow time)
- [ ] Open a comparison report if in the script; confirm photos/layout
- [ ] Optional: Portfolio / Property History PDF (recent features)
- [ ] Maintenance: open existing request or create one
- [ ] Notifications: confirm at least one in-app item or skip if none seeded
- [ ] If AI is demoed: one photo, one field only — do not bulk-analyse a 40-photo inspection live
- [ ] If mobile is demoed: Profile photo upload first; inspection photo on a **physical device** against the demo API — have web capture as fallback

**Hygiene**

- [ ] Browser hard-refresh so old JS bundle is not shown
- [ ] Hide `.env` / admin screens with secrets
- [ ] Confirm demo data is in **one** org
- [ ] Network tab: no unexpected 500s on the critical path
- [ ] WebSocket `/ws` optional; demo still works without live popups

---

## 13. Final Recommendation

**READY WITH MINOR FIXES**

Proceed with a **rehearsed web demo** on a healthy demo organisation. Do **not** improvise: other-org IDs, live Stripe, Reapit Connect (until configured), large AI batches, or untested Expo inspection uploads.

**This audit did not execute the webinar UI path in a browser.** Before going live, an owner must physically run section 12 on the demo URL.

---

## Appendix A — Evidence classes

| Class | Meaning |
| --- | --- |
| Verified working | Unit tests passed this session |
| Verified failing | Defect confirmed by reading the handler |
| Not tested | No runtime/browser/device this session |
| Cannot be tested | Local server down; no demo credentials used |

## Appendix B — Change log (this audit)

| File | Change | Reason | Risk |
| --- | --- | --- | --- |
| *(none)* | No application code changed | Audit-only as requested | n/a |
| `INSPECT360_PRE_WEBINAR_QA_REPORT.md` | Added | Deliverable | n/a |

## Appendix C — Unit tests executed

Executed with `npx tsx` (local). All 14 files **passed**, exit code 0: password policy 12; entitlements 70; rent math 3; credit requests 38; inspection notes 9; work-order certificates 35; entitlement notifications 53; billing tiers 39; password reset 21; work-order access 27; Reapit mappers 18; crypto 5; webhook 10; pagination/isolation 11.

## Appendix D — What was explicitly not done

- No production deploy, no Contabo SQL, no Stripe live charges
- No destructive pentest, no credential stuffing
- No AI model replacement
- No IDOR patches applied (reported; low-risk to apply after rehearsal)
- No mobile simulator / Android / iOS run
- No viewport matrix (desktop/tablet/phone)
