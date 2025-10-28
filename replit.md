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
- **Database Schema**: Includes tables for `users` (with roles: owner, clerk, compliance, tenant, contractor), `organizations`, `properties`, `blocks`, `inspections`, `compliance_documents`, `maintenance_requests`, `asset_inventory`, `contacts`, `tenant_assignments`, `message_templates`, and a tagging system.
- **Role-Based Access**: Granular control for various user roles (Owner Operators, Inventory Clerks, Compliance Officers, Tenants, Contractors).
- **Credit System**: A system for AI features (photo analysis, comparison reports) purchasable via Stripe, with initial free credits provided.
- **AI Features**: Integration with OpenAI GPT-5 Vision for photo analysis (condition assessment) and comparison reports (check-in vs. check-out summaries).
- **PWA**: Utilizes `manifest.json` and a service worker for offline capabilities and caching.
- **Performance**: Optimized database queries and Zod validation across the API.
- **Inspection Templates System**: JSON-based templates with a flexible editor, versioning, snapshots, and a visual Template Builder UI, supporting optional Condition and Cleanliness rating toggles. **New organizations automatically receive default Check In and Check Out templates** upon registration, each with 7 sections covering general information, room inspections, and sign-off requirements. Template creation failures are logged but don't abort organization setup (defensive error handling).
- **Inspection Capture Workflow**: A comprehensive field inspection workflow supporting data entry, real-time progress, optimistic updates, review pages, status management, and native smartphone camera capture (rear-camera default).
- **In-Inspection Quick Actions**: Contextual quick-add workflow enabling BTR operators to add assets, update existing inventory, and log maintenance without leaving the inspection capture page. Features include:
  - **Floating Action Button (FAB)**: Bottom-right positioned button with brand colors for thumb-friendly mobile access, opens menu with three options (Add Asset, Update Asset, Log Maintenance)
  - **Quick Add Asset Sheet**: Mobile-friendly bottom sheet with essential fields (name, category, condition, location), auto-populates property/block/inspection context, supports offline queueing
  - **Quick Update Asset Sheet**: Search and select existing assets filtered by property/block context, displays current state preview (name, category, condition, cleanliness, location), allows updating condition, cleanliness, location, and notes with inspection audit trail linking, supports offline queue synchronization
  - **Quick Log Maintenance Sheet**: Streamlined maintenance form with title, description, and priority fields; includes property selector for block-level inspections when multiple properties exist; auto-selects property when block has only one
  - **Audit Trail Linking**: All quick-added assets, asset updates, and maintenance requests automatically link to source inspection via `inspectionId` and `inspectionEntryId` fields for compliance tracking
  - **Offline Support**: Discriminated union queue system supports inspection_entry, asset, asset_update, and maintenance payloads with dedicated sync methods and offline deduplication via unique offlineId tokens
  - **Backend APIs**: POST /api/asset-inventory/quick, PATCH /api/asset-inventory/:id/quick, and POST /api/maintenance/quick endpoints with Zod validation, organization isolation, and offline deduplication support
  - **Context Preservation**: Quick actions minimize context switching—operators can document findings and verify/update existing inventory immediately without losing inspection progress or navigating away
- **Offline Queue System**: LocalStorage-based offline sync with auto-reconnection, status indicators, and Background Sync API integration for automatic retry. Extended with discriminated union types to support inspection entries, assets, and maintenance requests with dedicated sync methods.
- **AI-Powered Tenant Maintenance Requests**: Multi-step tenant portal with basic issue description, multi-image upload, and AI-powered fix suggestions using OpenAI Vision API.
- **InspectAI Field Analysis**: Field-level AI inspection analysis button using OpenAI GPT-5 Vision for comprehensive reports on uploaded images, integrated into the notes field.
- **Condition & Cleanliness Ratings**: Optional per-field ratings (Excellent/Good/Poor for Condition, Clean/Needs a Clean/Poor for Cleanliness) configurable in the Template Builder and available during inspection capture.
- **Inspection Reports**: Generates beautifully formatted HTML reports for completed and in-progress inspections with print-friendly CSS, interactive action buttons, inline editing for notes, and professional PDF cover pages featuring company logo, inspection details, property information, and inspector credentials.
- **Annual Compliance Calendar**: Visual compliance tracking grid showing inspection templates vs. months, with color-coded status badges, compliance rates, and summary stats.
- **Block-Level Filtering**: 
  - **Properties**: Properties page supports `?blockId=X` query parameter for filtering properties by block with breadcrumb navigation and dynamic page title; Blocks page "Properties" quick action button (first icon, Home icon) routes to filtered properties view; when creating a new property from a block-filtered view, the form automatically prepopulates the address and block selection from the current block.
  - **Asset Inventory**: Asset inventory page supports filtering by both `blockId` and `propertyId` with breadcrumb navigation and dynamic page titles; Blocks page includes "Inventory" quick action button for block-filtered view; Properties page includes "Inventory" quick action button for property-filtered view; when adding a new asset from a property-filtered or block-filtered view, the "Add Asset" form automatically pre-selects the property or block dropdown based on the URL context.
  - **Compliance**: Compliance page supports `?propertyId=X` and `?blockId=X` URL parameters for context-aware document uploads; Properties page "Compliance" quick action button routes to compliance with propertyId filter; Blocks page "Compliance" quick action button routes to compliance with blockId filter; when uploading a compliance document from a property-filtered or block-filtered view, the upload form automatically pre-selects the property or block dropdown based on the URL context.
- **Block Tenant Management**: Comprehensive tenant occupancy tracking, KPIs, and roster management on a dedicated BlockTenants page.
- **Property Detail Filtering**: Property detail page tabs (Inventory, Inspections, Tenants, Compliance) all properly filter data by propertyId with organization isolation. Tenant assignments queried via dedicated `getTenantAssignmentsByProperty` method that joins properties table for multi-tenant security.
- **API Security**: Comprehensive Zod validation on 15 schemas for all API operations, with 14 critical routes protected by `.safeParse()`. Multi-tenant isolation is enforced with 63 organization ownership checks across critical routes (including property detail tabs).
- **Object Storage ACL**: Asset inventory photos use visibility: "public" to allow organization-wide viewing without authentication. The `/objects/` serving route allows unauthenticated access for public objects while maintaining owner-only access for private objects.
- **Tenant Broadcast Messaging**: Block-level tenant communication system with reusable email templates and variable replacement. Features include:
  - **Message Templates System**: Database-backed reusable templates with name, subject, body, and variable tracking (owner/clerk access only)
  - **Variable Replacement**: Supports {tenant_name}, {tenant_email}, {block_name}, {block_address}, {property_name}, {sender_name} placeholders
  - **Broadcast Dialog UI**: Two-tab interface (template selection/custom message) with live preview, form validation, and variable hints
  - **Resend Integration**: Batch email sending to all active tenants in a block with individual tracking and error reporting
  - **Organization Isolation**: All templates and broadcasts scoped to organization with role-based access control (owner/clerk only)
  - **Block Tenants Page Integration**: "Broadcast Message" button on BlockTenants page (disabled when no active tenants)
- **Inline Tenant Creation**: Property-level tenant assignment workflow with integrated user creation for BTR managers. Features include:
  - **Two-Tab Interface**: "Select Existing" mode (dropdown of existing tenant users) and "Create New" mode (full user registration form)
  - **Complete User Registration**: First/last name, email, username, password fields with comprehensive validation
  - **Integrated Lease Details**: Lease start/end dates, monthly rent, deposit amount, and active status toggle
  - **Sequential Mutations**: Creates tenant user via POST /api/team, then assigns to property via POST /api/tenant-assignments
  - **Automatic Role Assignment**: New users automatically assigned 'tenant' role with organization scoping
  - **Numeric Field Conversion**: HTML number inputs properly converted to decimal values using parseFloat() before API submission
  - **Immediate UI Updates**: TanStack Query v5 cache invalidation with refetchType: "active" for instant tenant list refresh
  - **Comprehensive Error Handling**: Duplicate email/username detection, validation feedback, and detailed error messages
  - **Security**: Organization isolation enforced, owner/clerk role-based access control for tenant management

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