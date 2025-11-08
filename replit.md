# Inspect360 - AI-Powered Building Inspection Platform

## Overview
Inspect360 is a PWA-first building inspection platform designed for Build-to-Rent (BTR) operations. Its core purpose is to streamline property management and enhance operational efficiency. Key capabilities include role-based access, offline mobile inspections, AI-driven photo analysis and comparison reporting, compliance document tracking with expiry alerts, a dedicated tenant portal, internal maintenance tracking, tenant assignment management, block-level asset inventory filtering, a comprehensive subscription system with multi-currency support and credit-based inspections, and mark-for-review functionality for check-out inspections.

## User Preferences
- Prioritize PWA-first mobile experience
- Inspect360 branded color scheme: Bright Cyan (#00D5CC / HSL 174 100% 42%) primary, Teal (#3B7A8C / HSL 193 40% 38%) accents
- Logo: attached_assets/Inspect360 Logo_1761302629835.png (bright cyan magnifying glass with teal house icon)
- Clean, accessible enterprise UI with generous white space
- Role-based feature access
- Offline support for field inspections

## System Architecture
The platform utilizes a PWA-first approach built on a robust web architecture, emphasizing a modern, clean design system with a branded color palette.

### UI/UX Decisions
- **Modern Clean Design System**: Employs Inter font, clean cards with soft shadows, subtle hover effects, and skeleton loaders with cyan shimmer.
- **Color Scheme**: Bright Cyan for primary CTAs, Teal for accents/links, with clean white backgrounds and warm gray neutrals.
- **Branding**: Inspect360 logo is prominently displayed.
- **Layout**: Features a responsive left sidebar navigation and a top bar.

### Technical Implementations
- **Frontend**: React with TypeScript, Vite, Wouter for routing, TanStack Query for data fetching, Shadcn UI for components, Tailwind CSS for styling, and Uppy for file uploads.
- **Backend**: Express.js, PostgreSQL (Neon) with Drizzle ORM, and Passport.js for authentication.
- **Authentication**: Custom username/password authentication with session management.
- **Object Storage**: Google Cloud Storage for media files.
- **Database Schema**: Includes tables for `users` (with roles: owner, clerk, compliance, tenant, contractor), `organizations`, `properties`, `blocks`, `inspections`, `compliance_documents`, `maintenance_requests`, `asset_inventory`, `contacts`, `tenant_assignments`, `message_templates`, and a tagging system.
- **Role-Based Access**: Granular control for various user roles.
- **Credit System**: A system for AI features purchasable via Stripe, with initial free credits.
- **AI Features**: Integration with OpenAI GPT-5 Vision for photo analysis (condition assessment) and comparison reports (check-in vs. check-out summaries).
- **PWA**: Utilizes `manifest.json` and a service worker for offline capabilities and caching.
- **Performance**: Optimized database queries and Zod validation.
- **Inspection Templates System**: JSON-based templates with a flexible editor, versioning, snapshots, and a visual Template Builder UI, supporting optional Condition and Cleanliness rating toggles. New organizations automatically receive default Check In and Check Out templates.
- **PWA Install Prompt System**: Comprehensive install prompt handling for Android (beforeinstallprompt event capture with custom branded install button) and iOS (Safari-specific instructions with visual guidance). Features smart detection (only shows when not installed), dismissible UI with 7-day respawn, localStorage persistence, and integration across all app states (authenticated, unauthenticated, onboarding).
- **Inspection Capture Workflow**: Comprehensive field inspection workflow supporting data entry, real-time progress, optimistic updates, review pages, status management, and native smartphone camera capture.
- **In-Inspection Quick Actions**: Contextual quick-add workflow (Add Asset, Update Asset, Log Maintenance) via a Floating Action Button (FAB) for mobile, with offline queueing and audit trail linking.
- **Offline Queue System**: LocalStorage-based offline sync with auto-reconnection, status indicators, and Background Sync API integration, extended for inspection entries, assets, and maintenance requests.
- **AI-Powered Tenant Maintenance Requests**: Multi-step tenant portal with basic issue description, multi-image upload, and AI-powered fix suggestions.
- **InspectAI Field Analysis**: Field-level AI inspection analysis button using OpenAI GPT-5 Vision for comprehensive reports on uploaded images, integrated into notes.
- **Condition & Cleanliness Ratings**: Optional per-field ratings configurable in the Template Builder.
- **Inspection Reports**: Generates formatted HTML reports with print-friendly CSS, interactive action buttons, and professional PDF cover pages. Enhanced renderFieldValue function properly handles complex object structures (displays as formatted JSON in styled code blocks), arrays (comma-separated values), and improves null/undefined handling to prevent "[object Object]" display errors.
- **PDF Generation**: Server-side PDF generation using Puppeteer and Chromium for professional inspection reports. **Security**: Implements comprehensive XSS protection with HTML escaping for all user content and strict URL whitelisting (allows only https://, http://, and safe data:image types - blocks SVG/javascript/vbscript). **Backend**: PDF service (`server/pdfService.ts`) with `escapeHtml()` and `sanitizeUrl()` utilities, endpoint `/api/inspections/:id/pdf` with organization isolation. **Frontend**: Print button downloads PDF instead of browser print dialog. **Output**: Branded cover page with Inspect360 logo, property information grid, section headers, field values with photos/ratings/notes, all professionally formatted for A4 printing.
- **Annual Compliance Calendar**: Visual compliance tracking grid with color-coded status badges and compliance rates.
- **Block-Level Filtering**: Supports filtering of properties, asset inventory, and compliance documents by `blockId` and `propertyId` with contextual form pre-population.
- **Block Tenant Management**: Comprehensive tenant occupancy tracking, KPIs, and roster management.
- **Property Detail Filtering**: Property detail page tabs properly filter data by `propertyId` with organization isolation.
- **API Security**: Comprehensive Zod validation and multi-tenant isolation enforced across critical routes.
- **Object Storage ACL**: Asset inventory and inspection photos use public visibility for organization-wide viewing. Enhanced `/api/objects/fix-acls` endpoint now repairs ACLs for both asset inventory photos AND inspection entry photos, ensuring all uploaded images are publicly accessible within the organization.
- **Tenant Broadcast Messaging**: Block-level tenant communication system with reusable email templates and variable replacement.
- **Inline Tenant Creation**: Property-level tenant assignment workflow with integrated user creation, lease details, and automatic role assignment.
- **Collaborative Comparison Reports**: Complete end-to-end check-out inspection comparison system with AI-powered analysis, asset-based depreciation, async discussion, and electronic signatures. Features include database schema (`comparison_reports`, `comparison_report_items`, `comparison_comments`), full REST API (8 endpoints with organization isolation), AI image comparison using OpenAI GPT-4 Vision for damage assessment and cost estimation, asset-based depreciation calculation with intelligent fallbacks, threaded comment discussions, electronic signature workflow with duplicate prevention, and comprehensive UI with list view, detailed comparison viewer, side-by-side image display, status badges, and role-based access for owners, clerks, and tenants.
- **Fixflo Integration**: Complete two-way integration with Fixflo maintenance management system. **Backend**: Database schema (`fixflo_config`, `fixflo_webhook_logs`, `fixflo_sync_state` tables plus Fixflo fields on `properties` and `maintenance_requests`), Fixflo API client with Bearer auth and retry logic, 7 outbound REST API routes for creating/updating issues and managing config, inbound webhook endpoint (`POST /api/integrations/fixflo/webhook`) with signature verification and async event processing, comprehensive error handling and audit logging. **Frontend**: Configuration settings page (Settings > Integrations tab) with API credentials management, connectivity testing, property mapping to Fixflo property IDs, and sync status monitoring; FixfloSyncButton component in Maintenance page for one-click sync with status badges, contractor info display, and tooltips. Supports bi-directional sync of issue status, contractor assignments, completion status, invoices, and attachments with role-based access control (owner/clerk only).
- **UI Z-Index Layering Fix**: Fixed modal interaction issues by implementing proper z-index hierarchy (DialogOverlay: z-50, DialogContent: z-60 with max-h-[85vh] overflow-y-auto scrolling, SelectContent: z-70) to prevent pointer-event interference and ensure dropdown visibility in both manual and automated testing scenarios.
- **Auto-Template Selection**: When creating an inspection, selecting Type "Check In" or "Check Out" automatically selects the matching template via useEffect hook monitoring form.watch("type"). System automatically clears templateId to "__none__" when: (1) type changes to non-templated values (routine, maintenance), or (2) expected template doesn't exist/isn't active. Ensures inspections always have correct template snapshot for field capture and prevents stale template assignments.
- **Mark for Review**: Check-out inspection fields display a "Mark for Comparison Report" checkbox that only appears when: (1) inspection type is check_out, AND (2) at least one photo has been uploaded to that field. Checkbox includes auto-clear functionality - if all photos are deleted, markedForReview flag automatically resets to false. Backend supports PATCH updates to markedForReview flag with optimistic UI updates. Feature enables tenants and property managers to flag specific fields for inclusion in AI-powered comparison reports.
- **Manual Comparison Report Generation**: Comparison Reports page includes "Generate Report" button with property/inspection selection dialog. Users select a property, then choose completed check-in and check-out inspections to compare. System generates AI-powered analysis, cost estimation, and creates discussion thread (costs 2 credits per report).
- **Consolidated Maintenance Interface**: Unified Maintenance page with tabbed interface: "Requests" tab for all maintenance request management (submission, tracking, AI suggestions, Fixflo sync) and "Work Orders" tab for contractor assignment tracking (SLA monitoring, cost tracking, status updates). Single menu item accessible to owners, clerks, tenants, and contractors with role-based tab visibility.
- **Comprehensive Subscription System**: Complete credit-based subscription service with multi-currency support (GBP/USD/AED). **Database**: 6 new tables (`subscription_plans`, `subscriptions`, `credit_batches`, `credit_ledger`, `country_pricing_overrides`, `topup_orders`) tracking plans, active subscriptions, credit pools, transaction history, regional pricing, and one-time purchases. **Plans**: Starter (£49/50 credits), Professional (£149/200 credits), Enterprise (£349/500 credits), Enterprise+ (custom). **Credit System**: FIFO consumption logic with automatic 1-month rollover, 1-3 credits per inspection based on complexity (routine=1, check-in/check-out=2, maintenance=3), admin grant capability, and £0.75/credit top-up packs (100/500/1000 credits). **Stripe Integration**: Full checkout sessions, customer portal, webhook handling for subscription lifecycle (creation, renewal, cancellation, payment failures), automatic credit grants on billing cycles, and payment processing for top-ups. **API**: 15+ endpoints for plan browsing, subscription management, credit balance/ledger, top-up checkout, admin credit grants, and Eco-Admin country pricing configuration. **UI**: Comprehensive Billing & Credits page showing subscription status, credit balance/history, plan comparison, upgrade/downgrade, top-up purchase dialog, and Stripe portal access. **Inspection Integration**: Automatic credit consumption when inspections are marked complete with 402 Payment Required error on insufficient credits. **Country-Level Pricing**: Eco-Admin interface for configuring plan prices and top-up rates per country with date-range support. **Transparent Pricing**: All pricing displayed in organization's local currency with automatic currency conversion.

## External Dependencies
- **PostgreSQL (Neon)**: Primary database.
- **OpenAI Vision API**: AI photo analysis and comparison reports.
- **Stripe**: Payment processing for credits.
- **Google Cloud Storage**: Object storage for media.
- **Resend**: Email service.
- **Passport.js**: Authentication middleware.
- **Drizzle ORM**: TypeScript ORM.
- **Vite**: Frontend build tool.
- **Wouter**: Frontend routing library.
- **TanStack Query**: Data fetching and caching.
- **Shadcn UI**: UI component library.
- **Tailwind CSS**: Utility-first CSS framework.
- **Uppy**: File upload library, including Webcam plugin.
- **Puppeteer**: Headless browser for server-side PDF generation with Chromium.