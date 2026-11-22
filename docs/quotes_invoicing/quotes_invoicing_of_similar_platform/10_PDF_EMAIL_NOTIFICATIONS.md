# Phase 10 — PDFs, Email & Notifications

## Purpose
Specify document PDF generation, email templates, and notification triggers for quotes and invoices.

## Prerequisites
Phases 04–09 (send paths exist). Branding + email templates from Phase 02.

---

## 1. PDF generation (confirmed)

| Document | Generator | Consumers |
| --- | --- | --- |
| Quote | `server/lib/quote-pdf.ts` → `renderQuotePdfBuffer` | Send email attach, public PDF, portal PDF |
| Invoice | `server/lib/invoice-pdf.ts` | Admin PDF, email, public/portal, bulk ZIP |
| Portal helper | `server/lib/customer-portal-invoice-pdf.ts` | Portal download |

### Content expectations
- Org branding: logo, trading name, addresses, VAT, bank details
- Document reference, dates, customer snapshot
- Line table: name/description, qty, unit, unit price, VAT, line totals
- Header totals: subtotal, discount, tax, total (+ amount paid / outstanding for invoices)
- Terms HTML (sanitized snapshot)

### Storage
- Invoice send may persist `attached_assets/invoice_pdfs/{id}.pdf` and set `pdfStoragePath`.
- Quote attachments live under `attached_assets/quote_attachments/` (user uploads, not the PDF itself).

Portable approach: generate PDF bytes in-memory on demand; optionally cache to object storage.

---

## 2. Email sending (confirmed)

Wrappers in `server/email.ts`: `sendQuoteEmail`, `sendInvoiceEmail`, etc.

### Quote emails
| Trigger | Template key (example) | Attachments |
| --- | --- | --- |
| Send quote | `new_quote_sent` | Quote PDF |
| Supersession on revise | supersession template if configured | As implemented |

**Confirmed:** No billing-quote reminder endpoint on `/api/quotes/*`.  
(Legacy `/api/quotation/.../remind` is a **different** module — do not confuse.)

### Invoice emails
| Trigger | Notes |
| --- | --- |
| Send / resend | Lifecycle email with PDF + share/pay link |
| Chase reminders | `invoice-chase-service.ts` using chase templates |
| Payment receipt | `invoice-payment-receipt.ts` when paid |

If `clientEmailSnapshot` missing on send: record delivery event `skipped_no_email` and do not fail the status transition (HeyTeam behaviour).

### Templates
Stored in `quote_invoice_email_templates` per org + `templateKey`.  
Editable in settings UI (`EmailTemplatesPanel`).  
Keys: see `QUOTE_INVOICE_EMAIL_TEMPLATE_KEYS` in `shared/schema.ts` / `email-template-labels.ts`.

---

## 3. Share links in messages

- Quote: `{APP_BASE}/quote/{token}`
- Invoice: `{APP_BASE}/invoice/{token}`
- Pay CTA: Stripe Checkout URL when available, else share URL

---

## 4. Implementation steps

1. Choose PDF library; implement quote + invoice layouts from branding + lines.
2. Wire PDF into send routes and public/portal GET pdf.
3. Implement email sender with template merge (subject/body placeholders).
4. Seed default templates per org.
5. Hook chase + payment receipt emails.
6. Log delivery events for audit/support.

## 5. Acceptance criteria

- [ ] Sent quote email includes openable PDF.
- [ ] Public PDF matches on-screen totals.
- [ ] Invoice send includes pay/share link.
- [ ] Missing customer email does not leave document stuck in draft.
- [ ] Template edits reflect on next send.

## 6. Security

- Sanitize HTML in terms before PDF/email.
- PDF endpoints: public requires valid token; admin/portal require auth + ownership.
- Do not email internal notes.

## 7. References

- `server/lib/quote-pdf.ts`, `invoice-pdf.ts`, `customer-portal-invoice-pdf.ts`
- `server/email.ts`
- `server/lib/invoice-payment-receipt.ts`
- `server/invoice-chase-service.ts`
- `client/src/features/quote-invoice-settings/email-templates-panel.tsx`
