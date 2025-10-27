# Inspect360 - AI-Powered Building Inspection Platform

## Overview
Inspect360 is a PWA-first building inspection platform designed for Build-to-Rent (BTR) operations. Its core purpose is to streamline property management and enhance operational efficiency. Key capabilities include role-based access, offline mobile inspections, AI-driven photo analysis and comparison reporting, compliance document tracking with expiry alerts, a dedicated tenant portal, internal maintenance tracking, tenant assignment management, block-level asset inventory filtering, and an inspection credit system.

## User Preferences
- Prioritize PWA-first mobile experience
- Inspect360 branded color scheme: Bright Cyan (#00D5CC / HSL 174 100% 42%) primary, Teal (#3B7A8C / HSL 193 40% 38%) accents
- Logo: attached_assets/Inspect360 Logo_1761302629835.png (bright cyan magnifying glass with teal house icon)
- Clean, accessible enterprise UI with generous white space
- Role-based feature access
- Offline support for field inspections

## System Architecture
The platform utilizes a PWA-first approach built on a robust web architecture.

### UI/UX Decisions
- **Modern Clean Design System**: Employs Inter font, clean cards with soft shadows, 0.75rem border-radius, 150ms transitions, generous spacing, subtle hover effects, and skeleton loaders with cyan shimmer.
- **Color Scheme**: Bright Cyan for primary CTAs, Teal for accents/links, with clean white backgrounds and warm gray neutrals.
- **Branding**: Inspect360 logo is prominently displayed on login pages and the main app sidebar.
- **Layout**: Features a left sidebar navigation with a logo header and role-aware menus, and a top bar for logout, all within a responsive grid with ample white space.

### Technical Implementations
- **Frontend**: React with TypeScript, Vite, Wouter for routing, TanStack Query for data fetching, Shadcn UI for components, Tailwind CSS for styling, and Uppy for file uploads.
- **Backend**: Express.js, PostgreSQL (Neon) with Drizzle ORM, and Passport.js for authentication.
- **Authentication**: Custom username/password authentication using Passport.js with session management.
- **Object Storage**: Google Cloud Storage for media files.
- **Database Schema**: Includes tables for `users` (with roles: owner, clerk, compliance, tenant, contractor), `organizations`, `properties`, `blocks`, `inspections`, `compliance_documents`, `maintenance_requests`, `asset_inventory`, `contacts`, `tenant_assignments`, and a tagging system.
- **Role-Based Access**: Granular control for various user roles (Owner Operators, Inventory Clerks, Compliance Officers, Tenants, Contractors).
- **Credit System**: A system for AI features (photo analysis, comparison reports) purchasable via Stripe, with initial free credits provided.
- **AI Features**: Integration with OpenAI GPT-5 Vision for photo analysis (condition assessment) and comparison reports (check-in vs. check-out summaries).
- **PWA**: Utilizes `manifest.json` and a service worker for offline capabilities and caching.
- **Performance**: Optimized database queries and Zod validation across the API.
- **Inspection Templates System**: JSON-based templates with a flexible editor, versioning, snapshots, and a visual Template Builder UI, supporting optional Condition and Cleanliness rating toggles.
- **Inspection Capture Workflow**: A comprehensive field inspection workflow supporting data entry, real-time progress, optimistic updates, review pages, status management, and native smartphone camera capture (rear-camera default).
- **Offline Queue System**: LocalStorage-based offline sync with auto-reconnection, status indicators, and Background Sync API integration for automatic retry.
- **AI-Powered Tenant Maintenance Requests**: Multi-step tenant portal with basic issue description, multi-image upload, and AI-powered fix suggestions using OpenAI Vision API.
- **InspectAI Field Analysis**: Field-level AI inspection analysis button using OpenAI GPT-5 Vision for comprehensive reports on uploaded images, integrated into the notes field.
- **Condition & Cleanliness Ratings**: Optional per-field ratings (Excellent/Good/Poor for Condition, Clean/Needs a Clean/Poor for Cleanliness) configurable in the Template Builder and available during inspection capture.
- **Inspection Reports**: Generates beautifully formatted HTML reports for completed and in-progress inspections with print-friendly CSS, interactive action buttons, and inline editing for notes.
- **Annual Compliance Calendar**: Visual compliance tracking grid showing inspection templates vs. months, with color-coded status badges, compliance rates, and summary stats.
- **Block-Level Asset Inventory Filtering**: Asset inventory page supports filtering by `blockId` with breadcrumb navigation.
- **Block Tenant Management**: Comprehensive tenant occupancy tracking, KPIs, and roster management on a dedicated BlockTenants page.
- **API Security**: Comprehensive Zod validation on 15 schemas for all API operations, with 14 critical routes protected by `.safeParse()`. Multi-tenant isolation is enforced with 62 organization ownership checks across critical routes.

## External Dependencies
- **PostgreSQL (Neon)**: Primary database.
- **OpenAI Vision API**: AI photo analysis and comparison reports.
- **Stripe**: Payment processing for credits.
- **Google Cloud Storage**: Object storage for media.
- **Resend**: Email service for notifications and password resets.
- **Passport.js**: Authentication middleware.
- **Drizzle ORM**: TypeScript ORM for database interaction.
- **Vite**: Frontend build tool.
- **Wouter**: Frontend routing library.
- **TanStack Query**: Data fetching and caching library.
- **Shadcn UI**: UI component library.
- **Tailwind CSS**: Utility-first CSS framework.
- **Uppy**: File upload library, including Webcam plugin for camera access.