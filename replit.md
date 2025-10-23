# Inspect360 - AI-Powered Building Inspection Platform

## Overview
Inspect360 is a PWA-first building inspection platform designed for Build-to-Rent (BTR) operations. It provides role-based access for various stakeholders, offering offline mobile inspections, AI-driven photo analysis and comparison reporting using OpenAI Vision API, compliance document tracking with expiry alerts, a dedicated tenant portal, internal maintenance tracking, and an inspection credit system powered by Stripe. The platform's core purpose is to streamline property management and enhance operational efficiency within BTR businesses.

## User Preferences
- Prioritize PWA-first mobile experience
- Light, airy Sky Blue/Cobalt brand color scheme (clean modern SaaS aesthetic)
- Clean, accessible enterprise UI with generous white space
- Role-based feature access
- Offline support for field inspections

## System Architecture
The platform employs a PWA-first approach with a robust web architecture.

### UI/UX Decisions
- **Modern Clean Design System**: Utilizes Inter font, clean cards with soft shadows, 0.75rem border-radius, 150ms transitions, generous spacing (p-6/p-8, gap-6/gap-8), subtle hover effects, and skeleton loaders with sky blue shimmer.
- **Color Scheme**: Primary CTAs use Sky Blue (#5AB5E8), accents/links use Cobalt Blue (214 100% 50%), with clean white backgrounds and warm gray neutrals.
- **Components**: Clean white cards, pill-shaped buttons, minimal elevation.
- **Layout**: Left sidebar navigation with role-aware menus, top bar with logout, responsive grid with ample white space.

### Technical Implementations
- **Frontend**: React with TypeScript, Vite, Wouter (routing), TanStack Query (data fetching), Shadcn UI, Tailwind CSS, Uppy (file uploads).
- **Backend**: Express.js, PostgreSQL (Neon) with Drizzle ORM, Passport.js (local strategy) for authentication, and Express-session.
- **Authentication**: Custom username/password authentication using Passport.js.
- **Object Storage**: Google Cloud Storage for inspection photos and compliance documents.
- **Database Schema**: Includes `users` (with roles: owner, clerk, compliance, tenant, contractor), `organizations`, `properties`, `blocks`, `inspections`, `compliance_documents`, `maintenance_requests`, `asset_inventory`, `contacts`, and tables for the new tagging system.
- **Role-Based Access**: Granular control for Owner Operators, Inventory Clerks, Compliance Officers, Tenants, and Contractors.
- **Credit System**: AI photo analysis (1 credit) and comparison reports (2 credits), purchasable via Stripe; organizations receive 5 initial free credits.
- **AI Features**:
    - **Photo Analysis**: OpenAI GPT-5 Vision for condition assessment and issue identification.
    - **Comparison Reports**: AI-generated summaries for check-in vs. check-out inspection comparisons.
- **PWA**: `manifest.json` and service worker for offline capabilities and caching.
- **Performance**: Optimized database queries and Zod validation for API error handling.
- **Inspection Templates System**: JSON-based templates with a flexible structure editor, supporting various field types, versioning, and snapshots. Includes a Template Builder UI for visual editing and a Templates List Page with comprehensive filtering and management.
- **Inspection Capture Workflow**: Complete field inspection workflow with:
  - InspectionCapture page for data entry with 15 field type widgets
  - Real-time progress tracking based on completed fields
  - Entry persistence with optimistic updates
  - InspectionReview page for read-only verification
  - Status management (scheduled → in_progress → completed)
  - Template snapshot preservation for audit trail
  - Note and photo support on all fields

### Feature Specifications
- **Core Modules**: Properties, Blocks, Inspections, Compliance, Maintenance, Credit Management, Asset Inventory, Contacts, Tagging System.
- **Asset Inventory**: Tracks physical assets with detailed information, condition, and image uploads.
- **Contacts Management**: Comprehensive system for internal and external contacts with categorization and full CRUD.
- **Tagging System**: Organization-scoped tags with customizable colors, full CRUD API, and integration across entities like Blocks, Properties, Users, Compliance Documents, Asset Inventory, and Maintenance Requests. Features a global search.
- **Configurable Role-Based Dashboards**: Role-specific views with 9 panel types (stats, inspections, compliance, etc.), user customization, persistence, charts, empty states, and owner-only role switching.
- **Tenant Portal**: Secure access for property reports and maintenance requests.
- **Team Management**: Owner-controlled user and role administration.
- **Organization Onboarding**: Streamlined setup process.
- **Search and Filters**: Functionality for properties and blocks.
- **Block-Property Relationship**: Properties assigned to blocks, with associated metrics.

## External Dependencies
- **PostgreSQL (Neon)**: Primary database.
- **OpenAI Vision API**: AI photo analysis and comparison reports.
- **Stripe**: Payment processing for credits.
- **Google Cloud Storage**: Object storage for media.
- **Resend**: Email service for team invitations.
- **Passport.js**: Authentication middleware.
- **Drizzle ORM**: TypeScript ORM.
- **Vite**: Frontend build tool.
- **Wouter**: Frontend routing.
- **TanStack Query**: Data fetching.
- **Shadcn UI**: UI component library.
- **Tailwind CSS**: Styling framework.
- **Uppy**: File upload library.