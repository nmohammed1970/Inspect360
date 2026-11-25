# Breadcrumb exclusions

These surfaces intentionally have **no** application breadcrumbs:

| Path / state | Reason |
|--------------|--------|
| `/auth`, `/forgot-password`, `/reset-password` | User authentication |
| `/tenant/login` | Tenant authentication |
| `/admin/login`, `/admin/forgot-password`, `/admin/reset-password` | Admin authentication |
| `/pricing` (unauthenticated) | Marketing |
| `/public/quotes/:token`, `/public/invoices/:token`, `/public/work-orders/accept/:token` | Public token share links |
| `/maintenance-feedback/:token` | Public job feedback form |
| Organization setup / onboarding full-screen | Pre-shell flows |
| `NotFound` / loading redirects | Transient / error |

Enforced in code via `BREADCRUMB_EXCLUSIONS` / `isBreadcrumbExcluded()` in `breadcrumbRegistry.ts`.
