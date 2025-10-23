# Inspect360 - AI-Powered Building Inspection Platform

## Overview
Inspect360 is a PWA-first building inspection platform for Build-to-Rent (BTR) operations. It offers role-based access for Owner Operators, Inventory Clerks, Compliance Officers, and Tenants. Key capabilities include offline mobile inspections, AI-powered photo analysis and comparison reporting using OpenAI Vision API, compliance document tracking with expiry alerts, a tenant portal, internal maintenance tracking, and an inspection credit system powered by Stripe. The platform aims to streamline property management and enhance operational efficiency for BTR businesses.

## User Preferences
- Prioritize PWA-first mobile experience
- Light, airy Sky Blue/Cobalt brand color scheme (clean modern SaaS aesthetic)
- Clean, accessible enterprise UI with generous white space
- Role-based feature access
- Offline support for field inspections

## System Architecture
The platform follows a PWA-first approach with a robust web architecture.

### UI/UX Decisions
- **Modern Clean Design System (October 2025)**:
  - **Typography**: Inter font system with semibold headers (weight 600) and clear hierarchy
  - **Clean Cards**: White backgrounds with soft shadows (shadow-sm: 0 2px 8px rgba(0,0,0,0.04))
  - **Shadows**: Soft, subtle shadow system for gentle elevation without heavy effects
  - **Border Radius**: Modern 0.75rem (12px) for cards and components
  - **Transitions**: Fast, direct 150ms transitions for all interactive elements
  - **Spacing**: Generous spacing with p-6/p-8 containers and gap-6/gap-8 grids
  - **Visual Feedback**: Subtle hover lift effects, no background tints on hover
  - **Loading States**: Skeleton loaders with sky blue shimmer animation
- **Color Scheme**: Sky Blue (#5AB5E8 / 199 79% 63%) for primary CTAs, Cobalt Blue (214 100% 50%) for accents/links, Clean white backgrounds with warm gray neutrals for text/borders.
- **Components**: Clean white cards with soft borders, pill-shaped buttons (rounded-full), minimal elevation.
- **Layout**: Left sidebar navigation with role-aware menu items, top bar with logout, responsive grid layout with generous white space.

### Technical Implementations
- **Frontend**: React with TypeScript, Vite, Wouter for routing, TanStack Query for data fetching, Shadcn UI components, Tailwind CSS for styling, and Uppy for file uploads.
- **Backend**: Express.js, PostgreSQL (Neon) for the database, Drizzle ORM, Passport.js with Local Strategy for custom username/password authentication, and Express-session for session management.
- **Authentication**: Custom username/password authentication with Passport.js, utilizing `req.user.id` for user identification across API routes.
- **Object Storage**: Google Cloud Storage for inspection photos and compliance documents with ACL policies.
- **Database Schema**: Core tables include `users` (with roles: owner, clerk, compliance, tenant, contractor), `organizations`, `properties`, `blocks`, `inspections`, `inspection_items`, `compliance_documents`, `maintenance_requests`, `work_orders`, `work_logs`, `comparison_reports`, `credit_transactions`, `asset_inventory`, and `contacts`. Properties represent buildings/locations without subdivisions.
- **Role-Based Access**: Granular access control for Owner Operators (full access), Inventory Clerks (inspections, photo uploads), Compliance Officers (document management, expiry tracking), Tenants (property-specific reports, maintenance requests), and Contractors (assigned work orders).
- **Credit System**: AI photo analysis (1 credit), AI comparison reports (2 credits). Credits are purchased via Stripe, and organizations receive 5 free credits initially.
- **AI Features**:
    - **Photo Analysis**: Powered by OpenAI GPT-5 Vision to analyze room/item conditions, generate assessments, and identify issues.
    - **Comparison Reports**: Compares check-in vs. check-out inspections, highlights changes, and generates AI summaries for deposit decisions.
- **PWA**: Includes a `manifest.json` for app metadata and a service worker for offline capabilities and caching.
- **Performance**: Optimized database queries (e.g., `getBlocksWithStats` uses batched queries) and Zod validation for robust API error handling.

### Feature Specifications
- **Core Modules**: Properties, Blocks, Inspections, Compliance, Maintenance, Credit Management, Asset Inventory, Contacts, Tagging System.
- **Asset Inventory**: Track physical assets and equipment across properties and blocks with photos, supplier information, purchase dates, condition tracking (excellent, good, fair, poor, needs_replacement), and expected lifespan. Supports filtering by property or block, full CRUD operations, and image uploads via Uppy.
- **Contacts Management**: Comprehensive contact management system for tracking internal team members and external contacts (contractors, leads, companies, partners, vendors). Features include contact type categorization, full profile details (name, company, contact info, location, job title, notes), search and filtering by type/name/company, card-based UI with avatars and badges, and full CRUD operations. Accessible to owner, clerk, and compliance roles.
- **Tagging System (October 2025 - In Progress)**: Comprehensive tagging infrastructure for organizing and searching all entities. Features include:
  - **Tag Management**: Create, edit, and delete tags with customizable colors. Tags are organization-scoped.
  - **Backend Infrastructure**: Complete backend implementation with full CRUD API routes for tags and tag-entity associations for Blocks, Properties, Users, Compliance Documents, Asset Inventory, and Maintenance Requests.
  - **Database Schema**: Tags table with many-to-many join tables (block_tags, property_tags, user_tags, compliance_document_tags, asset_inventory_tags, maintenance_request_tags) fully implemented and synced to database.
  - **Global Search**: Functional TagSearch component accessible from Dashboard that searches across all entity types and displays categorized results.
  - **Reusable Components**: TagInput component with autocomplete, tag creation, and badge display ready for use in entity forms.
  - **Current Integration Status**: 
    - ✅ Blocks: Full tag assignment UI integrated in create/edit forms
    - ⏳ Properties, Users, Compliance Documents, Asset Inventory, Maintenance Requests: Backend ready, frontend integration pending
  - **Extension Pattern**: The TagInput component and tag persistence logic from Blocks serves as a reusable pattern for integrating tags into remaining entity forms.
- **Configurable Role-Based Dashboards (October 2025)**: Comprehensive dashboard system with role-specific views and user customization. Features include:
  - **Role-Specific Panels**: 9 panel types (stats, inspections, compliance, maintenance, assets, workOrders, inspectionTrend, statusDistribution, credits) with role-based access control
  - **Panel Permissions**: Server-side and client-side enforcement ensures users only see authorized panels (e.g., credits panel owner-only, compliance panel for owner/compliance roles)
  - **Configurable Layout**: Users can show/hide available panels via Configure dialog; preferences persist in database
  - **Charts & Visualizations**: Recharts-powered LineChart for inspection trends and PieChart for status distribution
  - **Empty States**: Panels display helpful empty states with CTAs when enabled but no data exists
  - **Role View Switching (Owner Only)**: Owners can preview dashboard as other roles (clerk, compliance) without changing actual permissions
  - **Quick Stats**: Always-visible stats showing properties, blocks, inspections, and AI credits (owner-only)
  - **Security**: Backend validates panel IDs against user role before persisting preferences to prevent privilege escalation
- **Tenant Portal**: Secure access to property-specific reports and maintenance request submission.
- **Team Management**: Owner-controlled user and role management.
- **Organization Onboarding**: Streamlined setup for new organizations.
- **Search and Filters**: Functionality to search and filter properties and blocks by name/address.
- **Block-Property Relationship**: Properties can be assigned to blocks, and block details include associated properties with metrics.

## External Dependencies
- **PostgreSQL (Neon)**: Main database for all application data.
- **OpenAI Vision API (via Replit AI Integrations)**: For AI-powered photo analysis and comparison report generation.
- **Stripe**: Payment gateway for credit purchases and webhook handling.
- **Google Cloud Storage**: Object storage for inspection photos and compliance documents.
- **Resend**: Email service for sending team invitation emails (configured and ready for Team Management feature).
- **Passport.js**: Authentication middleware.
- **Drizzle ORM**: TypeScript ORM for database interactions.
- **Vite**: Frontend build tool.
- **Wouter**: Frontend routing library.
- **TanStack Query**: Data fetching library.
- **Shadcn UI**: UI component library.
- **Tailwind CSS**: Utility-first CSS framework.
- **Uppy**: File upload library.

### Inspection Templates System (October 2025 - In Progress)
Comprehensive JSON-based inspection template system with flexible structure editor, offline support, and AI integration.

**Architecture**:
- **JSON-First Design**: Templates use a flexible `structureJson` field instead of normalized tables, allowing dynamic field types and validation rules
- **Database Tables**: 
  - `inspection_templates`: Template metadata with JSON structure (replacing old `inspection_template_points`)
  - `template_categories`: Optional categorization with color-coding
  - `template_inventory_links`: Bind templates to inventory templates for auto-generation
  - `inspection_entries`: Field-level data capture with offline sync support
  - `ai_image_analyses`: AI-powered photo analysis results
- **Versioning**: Templates support versioning with `parentTemplateId` and incremental `version` numbers for template evolution
- **Snapshot System**: Inspections store `templateSnapshotJson` and `inventorySnapshotJson` at creation time to preserve structure even if templates change

**Template Builder UI (Task 4 - Complete)**:
- Full-screen visual editor for creating/editing templates
- **Metadata Editor**: Configure name, description, scope (property/block/both), category, active status
- **Structure Builder**: Visual interface for sections and fields
  - Add/remove/reorder sections with drag-and-drop indicators
  - Collapsible sections for better organization
  - Repeatable sections (e.g., multiple bedrooms)
  - Section descriptions for inspector guidance
- **Field Editor**: Rich field configuration within each section
  - 15 supported field types: short_text, long_text, number, rating (1-5), select, multiselect, boolean, date, time, datetime, photo, photo[], video, gps, signature
  - Required field toggle
  - Placeholder and option configuration
  - Validation rules and conditional visibility (depends_on)
- **Preview Mode**: JSON structure preview for debugging
- **Responsive Design**: Works on desktop and tablet devices
- **Component**: `TemplateBuilder.tsx` with collapsible sections and field management

**Templates List Page (Task 5 - Complete)**:
- Card-based grid layout showing all templates with loading skeletons
- **Comprehensive Filtering**: Search by name/description, filter by category/scope/status, sort by 5 options
- **Search Functionality**: Real-time client-side search with clear button
- **Scope Filter**: Filter by Property/Block/Both with smart logic (property filter includes "both" templates)
- **Sorting Options**: Name A-Z, Name Z-A, Newest First, Oldest First, Highest Version
- **Clear Filters Button**: Resets all filters to defaults, appears when any filter is active
- **Result Count**: Shows "X templates" with "(filtered from Y)" notation when filters applied
- **Enhanced Empty States**: Context-aware messages for "no templates" vs "no matching filters"
- Template cards display: name, description, category badge, scope, version number, active toggle
- Quick actions: Edit, Clone (create new version), Delete
- Category management dialog with color picker

**API Routes (21 endpoints)**:
- Template Categories: GET, POST, PUT, DELETE
- Inspection Templates: GET (list with filtering), GET (single), POST, PUT, DELETE, POST (clone for versioning)
- Template Inventory Links: GET (by template), POST, DELETE
- Inspection Entries: GET (by inspection), GET (single), POST, POST (batch with conflict resolution), PUT, DELETE
- AI Image Analyses: GET (by inspection), GET (by entry), POST (with OpenAI integration and credit deduction)

**Key Features**:
- **Offline Sync**: Batch entry creation with idempotent conflict resolution using `offlineId` unique constraint
- **AI Integration**: OpenAI GPT-5 Vision analysis with credit management (1 credit per photo)
- **Role-Based Access**: Owner/Clerk can create/edit, Compliance can view
- **Template Cloning**: Easy versioning by cloning with auto-incremented version number
- **Active/Inactive Toggle**: Hide unused templates without deletion
- **Query Filtering**: Filter templates by scope, category, and active status
- **Zod Validation**: All API inputs validated with Drizzle-Zod schemas

**Completed Tasks**:
- ✅ Task 1: Database schema implementation
- ✅ Task 2: Storage layer with offline sync
- ✅ Task 3: Backend API routes (21 endpoints)
- ✅ Task 4: Template Builder UI with visual editor (October 23, 2025)
- ✅ Task 5: Templates list page filtering enhancements (October 23, 2025)

**Pending Tasks**:
- Task 6: Update inspection creation flow to support template selection and snapshot creation
- Tasks 7-18: Inspector capture UI, field widgets, offline queue, review screens, comparison reports
- Task 19: Full documentation update
- Task 20: End-to-end testing