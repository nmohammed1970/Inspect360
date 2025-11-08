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
- **Database Schema**: Includes tables for users, organizations, properties, blocks, inspections, compliance documents, maintenance requests, asset inventory, contacts, tenant assignments, message templates, and a tagging system.
- **Role-Based Access**: Granular control for various user roles.
- **Credit System**: A system for AI features purchasable via Stripe, with initial free credits.
- **AI Features**: Integration with OpenAI GPT-5 Vision for photo analysis (condition assessment) and comparison reports (check-in vs. check-out summaries).
- **PWA**: Utilizes `manifest.json` and a service worker for offline capabilities and caching.
- **Inspection Templates System**: JSON-based templates with a flexible editor, versioning, snapshots, and a visual Template Builder UI. New organizations automatically receive default Check In and Check Out templates.
- **PWA Install Prompt System**: Comprehensive install prompt handling for Android and iOS, with smart detection and persistence.
- **Inspection Capture Workflow**: Comprehensive field inspection workflow supporting data entry, real-time progress, optimistic updates, review pages, status management, and native smartphone camera capture.
- **In-Inspection Quick Actions**: Contextual quick-add workflow via a Floating Action Button (FAB) for mobile, with offline queueing and audit trail linking.
- **Offline Queue System**: LocalStorage-based offline sync with auto-reconnection, status indicators, and Background Sync API integration for inspection entries, assets, and maintenance requests.
- **AI-Powered Tenant Maintenance Requests**: Multi-step tenant portal with basic issue description, multi-image upload, and AI-powered fix suggestions.
- **InspectAI Field Analysis**: Field-level AI inspection analysis button using OpenAI GPT-5 Vision for comprehensive reports on uploaded images, integrated into notes.
- **Condition & Cleanliness Ratings**: Optional per-field ratings configurable in the Template Builder.
- **Inspection Reports**: Generates formatted HTML reports with print-friendly CSS and professional PDF cover pages.
- **PDF Generation**: Server-side PDF generation using Puppeteer and Chromium with security measures like XSS protection, URL whitelisting, image handling, text formatting, and smart content filtering.
- **Annual Compliance Calendar**: Visual compliance tracking grid with color-coded status badges and compliance rates.
- **Block-Level Filtering**: Supports filtering of properties, asset inventory, and compliance documents by `blockId` and `propertyId`.
- **Block Tenant Management**: Comprehensive tenant occupancy tracking, KPIs, and roster management.
- **API Security**: Comprehensive Zod validation and multi-tenant isolation enforced across critical routes.
- **Object Storage ACL**: Asset inventory and inspection photos use public visibility for organization-wide viewing.
- **Tenant Broadcast Messaging**: Block-level tenant communication system with reusable email templates.
- **Inline Tenant Creation**: Property-level tenant assignment workflow with integrated user creation, lease details, and automatic role assignment.
- **Collaborative Comparison Reports**: End-to-end check-out inspection comparison system with AI-powered analysis, asset-based depreciation, async discussion, and electronic signatures.
- **Fixflo Integration**: Complete two-way integration with Fixflo maintenance management system including backend API client, webhooks, and frontend configuration.
- **UI Z-Index Layering Fix**: Implemented proper z-index hierarchy for modals and dropdowns.
- **Auto-Template Selection**: Automatic template selection based on inspection type, ensuring correct template snapshots.
- **Mark for Review**: Check-out inspection fields include a "Mark for Comparison Report" checkbox, appearing when photos are present, for flagging items for AI comparison reports.
- **Manual Comparison Report Generation**: Users can manually generate AI-powered comparison reports by selecting check-in and check-out inspections.
- **Consolidated Maintenance Interface**: Unified Maintenance page with tabbed interface for "Requests" and "Work Orders".
- **Inline Maintenance Request Creation**: Inspection report page features inline dialog for creating maintenance requests directly from inspection fields without navigation, with automatic linking to inspectionId and inspectionEntryId, pre-populated contextual titles, and display of linked maintenance requests below each field with status/priority badges.
- **Flexible Inspection Status Management**: Inspection report page includes an editable status dropdown allowing users to change inspection status (scheduled/in_progress/completed) at any time, without requiring 100% completion or other progress-based restrictions.
- **Comprehensive Subscription System**: Credit-based subscription service with multi-currency support, including plans, credit consumption logic, Stripe integration for payments and webhooks, and an Eco-Admin interface for country-level pricing.

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
- **Uppy**: File upload library.
- **Puppeteer**: Headless browser for server-side PDF generation.