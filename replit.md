# Inspect360 - AI-Powered Building Inspection Platform

## Overview
Inspect360 is a PWA-first building inspection platform for Build-to-Rent (BTR) operations. It offers role-based access, offline mobile inspections, AI-driven photo analysis and comparison reporting using OpenAI Vision API, compliance document tracking with expiry alerts, a dedicated tenant portal, internal maintenance tracking, and an inspection credit system powered by Stripe. The platform's core purpose is to streamline property management and enhance operational efficiency within BTR businesses.

## User Preferences
- Prioritize PWA-first mobile experience
- Inspect360 branded color scheme: Bright Cyan (#00D5CC / HSL 174 100% 42%) primary, Teal (#3B7A8C / HSL 193 40% 38%) accents
- Logo: attached_assets/Inspect360 Logo_1761302629835.png (bright cyan magnifying glass with teal house icon)
- Clean, accessible enterprise UI with generous white space
- Role-based feature access
- Offline support for field inspections

## System Architecture
The platform employs a PWA-first approach with a robust web architecture.

### UI/UX Decisions
- **Modern Clean Design System**: Uses Inter font, clean cards with soft shadows, 0.75rem border-radius, 150ms transitions, generous spacing, subtle hover effects, and skeleton loaders with cyan shimmer.
- **Color Scheme**: Primary CTAs use Bright Cyan, accents/links use Teal, with clean white backgrounds and warm gray neutrals.
- **Branding**: Inspect360 logo prominently displayed on login pages and main app sidebar.
- **Components**: Clean white cards, pill-shaped buttons, minimal elevation.
- **Layout**: Left sidebar navigation with Inspect360 logo header and role-aware menus, top bar with logout, responsive grid with ample white space.

### Technical Implementations
- **Frontend**: React with TypeScript, Vite, Wouter, TanStack Query, Shadcn UI, Tailwind CSS, Uppy.
- **Backend**: Express.js, PostgreSQL (Neon) with Drizzle ORM, Passport.js for authentication, and Express-session.
- **Authentication**: Custom username/password authentication using Passport.js.
- **Object Storage**: Google Cloud Storage for media.
- **Database Schema**: Includes `users` (with roles: owner, clerk, compliance, tenant, contractor), `organizations`, `properties`, `blocks`, `inspections`, `compliance_documents`, `maintenance_requests`, `asset_inventory`, `contacts`, and tagging system tables.
- **Role-Based Access**: Granular control for Owner Operators, Inventory Clerks, Compliance Officers, Tenants, and Contractors.
- **Credit System**: AI photo analysis (1 credit) and comparison reports (2 credits) purchasable via Stripe; organizations receive 5 initial free credits.
- **AI Features**: OpenAI GPT-5 Vision for photo analysis (condition assessment) and comparison reports (check-in vs. check-out summaries).
- **PWA**: `manifest.json` and service worker for offline capabilities and caching.
- **Performance**: Optimized database queries and Zod validation.
- **Inspection Templates System**: JSON-based templates with a flexible editor, versioning, snapshots, and a visual Template Builder UI with optional per-field Condition and Cleanliness rating toggles.
- **Inspection Capture Workflow**: Full field inspection workflow with data entry, real-time progress, optimistic updates, review page, status management, template snapshot preservation, note/photo support with native smartphone camera capture, and optional Condition/Cleanliness dropdowns for fields that have these ratings enabled.
- **Field ID Migration**: Template fields use both `id` and `key` properties (same value) for compatibility; runtime migration ensures legacy templates without `id` get migrated automatically in TemplateBuilder and InspectionCapture.
- **Camera Integration**: Uppy Webcam plugin enables direct photo capture from smartphone cameras during inspections in PWA mode, with rear-camera default ('environment' facing mode) for optimal field use; requires HTTPS (provided by Replit deployment).

### Feature Specifications
- **Core Modules**: Properties, Blocks, Inspections, Compliance, Maintenance, Credit Management, Asset Inventory, Contacts, Tagging System.
- **Property Detail Page**: Comprehensive BTR property view with Overview Stats, Inspections, Tenants, Inventory, Compliance, and Maintenance tabs, enriched with BTR metadata.
- **Asset Inventory**: Comprehensive BTR asset management with categories, detailed tracking, financial management (depreciation), condition & cleanliness ratings, maintenance tracking, warranty management, supplier info, multi-photo support, flexible assignment, search & filtering, and full CRUD operations.
- **Contacts Management**: System for internal/external contacts with categorization, full CRUD, organization-scoped tags, tag management UI (with inline creation), tag display, and filtering.
- **Tagging System**: Organization-scoped tags with customizable colors, full CRUD API, integrated across Blocks, Properties, Users, Compliance Documents, Asset Inventory, Maintenance Requests, and Contacts, with global search.
- **Configurable Role-Based Dashboards**: Role-specific views with 9 panel types, user customization, persistence, charts, and owner-only role switching.
- **Tenant Portal**: Secure access for property reports and maintenance requests.
- **Team Management**: Comprehensive team member profiles with basic info, professional details (skills, education), address management, role assignment, account status management (active/inactive), and owner controls for full administration.
- **Photo & Video Upload**: Uppy integration with Google Cloud Storage for photo, photo_array, and video field types (10MB/100MB limits).
- **Smartphone Camera Capture**: Native camera access for taking photos directly during inspections via PWA, powered by Uppy Webcam plugin with rear-camera default for field inspections.
- **Offline Queue System**: LocalStorage-based offline sync with auto-reconnection and status indicators.
- **AI-Powered Tenant Maintenance Requests**: Multi-step tenant portal with basic issue description, multi-image upload, AI-powered fix suggestions using OpenAI Vision API, and review before submission.
- **InspectAI Field Analysis**: Field-level AI inspection analysis button that analyzes all uploaded images for an inspection point using OpenAI GPT-5 Vision and auto-generates comprehensive reports in the notes field; costs 1 credit per analysis.
- **Condition & Cleanliness Ratings**: Optional per-field ratings (Excellent/Good/Poor for Condition, Clean/Needs a Clean/Poor for Cleanliness) configurable in Template Builder; when enabled, dropdowns appear during inspection capture below field inputs; values stored as composite objects {value, condition?, cleanliness?}.
- **Inspection Reports**: Beautifully formatted HTML reports for completed and in-progress inspections with print-friendly CSS, displaying inspection metadata, all sections/fields with values, condition/cleanliness badges, photos, AI analysis notes, and interactive action buttons; Owner/Manager roles can edit notes inline with changes persisting via PATCH API.

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
- **Uppy**: File upload library with Webcam plugin for camera access.

## Backend API Implementations
- **Credit Management**:
  - `storage.deductCredit()`: Deducts credits from organization balance with transaction logging, validates sufficient credits, throws errors for overdrafts
  - Automatic credit transaction creation with negative amounts for usage tracking
  - Full audit trail of all credit usage through creditTransactions table
- **Organization Management**:
  - `storage.updateOrganization()`: Generic update method for organization fields (subscription level, credits, active status)
  - Used by admin routes for instance management and configuration
- **Maintenance Requests**:
  - Automatically includes organizationId from user session (frontend form omits it, backend adds from session)
  - Full validation of property ownership before creation
  - AI-powered image analysis with credit deduction using OpenAI Vision API
  - `storage.getMaintenanceByOrganization()`: Returns complete maintenance requests with reporter/assignee user details via Drizzle table aliases
  - Frontend mutations use correct apiRequest(method, url, data) parameter order and parse JSON responses
- **InspectAI Field Analysis**:
  - New endpoint POST /api/ai/inspect-field for field-level inspection analysis
  - Accepts inspectionId, fieldKey, fieldLabel, fieldDescription, and photos array
  - Analyzes all photos for a field together using OpenAI GPT-5 Vision with multi-image support
  - Generates comprehensive inspection reports (condition, damage, cleanliness, features, recommendations)
  - Auto-populates notes field in FieldWidget component
  - Costs 1 credit per field analysis with full transaction logging
  - Button appears automatically when photos are uploaded to any inspection field
  - Proper JSON response parsing in frontend (await response.json())
- **Null Safety**:
  - Proper null coalescing for credit checks
  - Lazy OpenAI client initialization via getOpenAI()
  - Type-safe session handling for admin authentication