# Inspect360 - AI-Powered Building Inspection Platform

## Project Overview

Inspect360 is a comprehensive PWA-first building inspection platform designed for Build-to-Rent (BTR) operations. The platform provides role-based access for Owner Operators, Inventory Clerks, Compliance Officers, and Tenants, with offline mobile inspection capabilities, AI-powered photo analysis using OpenAI Vision API, comparison report generation, compliance document tracking with expiry alerts, tenant portal, internal maintenance tracking, and an inspection credit system powered by Stripe.

**Reference Specification:** A comprehensive feature specification is available at `attached_assets/SPECIFICATION.md` which outlines extended features and alternative architecture approaches (Supabase + Next.js). We maintain our current tech stack (Express + PostgreSQL + React) and reference this spec for feature ideas and future enhancements.

## Project Status

**Current Implementation (MVP Complete):**
- ✅ Complete PostgreSQL database schema with all tables
- ✅ Storage interface with full CRUD operations
- ✅ Custom username/password authentication with Passport.js (migrated from Replit Auth)
- ✅ Object Storage configured with ACL policies for inspection photos
- ✅ Backend API routes for all major features
- ✅ OpenAI Vision API integration for photo analysis and comparisons
- ✅ Stripe integration for credit purchases
- ✅ Design system with Navy/Green/Deep Blue brand colors
- ✅ Sidebar navigation with role-aware menu items
- ✅ Owner Dashboard with real KPIs (properties, units, inspections, credits)
- ✅ Properties management page with CRUD operations
- ✅ Units management with property association
- ✅ Credits management with Stripe checkout flow
- ✅ Compliance dashboard with expiry tracking and role-based access
- ✅ Maintenance tracking with status workflow and tenant portal
- ✅ Comparison reports UI with side-by-side inspection viewing
- ✅ Organization onboarding flow for new users
- ✅ Team management page with role updates
- ✅ Inspection detail page with photo upload and AI analysis
- ✅ Tenant portal with secure unit filtering and maintenance requests
- 🚧 PWA manifest and service worker - planned for next iteration

## Tech Stack

**Frontend:**
- React + TypeScript
- Vite
- Wouter (routing)
- TanStack Query (data fetching)
- Shadcn UI components
- Tailwind CSS
- Uppy (file uploads)

**Backend:**
- Express.js
- PostgreSQL (Neon)
- Drizzle ORM
- Passport.js with Local Strategy (username/password authentication)
- Express-session with PostgreSQL store
- OpenAI Vision API (via Replit AI Integrations)
- Stripe (payments)
- Google Cloud Storage (object storage)

## Architecture

### Database Schema

**Core Tables:**
- `users` - User accounts with roles (owner, clerk, compliance, tenant)
- `organizations` - Organization/company entities with Stripe and credit info
- `properties` - Buildings/blocks managed by organizations
- `units` - Individual apartments/units within properties
- `inspections` - Inspection records (check-in, check-out, routine, maintenance)
- `inspection_items` - Individual inspection items with photos and ratings
- `compliance_documents` - Compliance documents with expiry tracking
- `maintenance_requests` - Internal maintenance work orders
- `comparison_reports` - AI-generated comparison reports
- `credit_transactions` - Credit purchase and usage history
- `sessions` - User session storage (required for Passport.js session management)

### Role-Based Access

**Owner Operator:**
- Full access to all features
- Manage properties, units, and team members
- View all inspections and reports
- Purchase credits and manage billing
- Access compliance and maintenance tracking

**Inventory Clerk:**
- Conduct inspections (mobile-optimized)
- Upload photos and rate conditions
- View assigned inspections
- Submit maintenance requests

**Compliance Officer:**
- Manage compliance documents
- Track expiry dates and alerts
- Upload certificates and licenses
- View compliance reports

**Tenant:**
- View comparison reports for their unit
- Submit maintenance requests (only for their assigned units)
- Track their own maintenance requests
- Access tenant-specific dashboard
- Secure unit filtering (can only see/select their own units)

### Credit System

- Each AI photo analysis costs 1 credit
- Each AI comparison report costs 2 credits
- Credits purchased via Stripe checkout
- Organizations start with 5 free credits
- Low credit alerts displayed on dashboard

### AI Features

**Photo Analysis:**
- Powered by OpenAI GPT-5 Vision
- Analyzes condition of rooms, appliances, fixtures
- Generates detailed condition assessments
- Identifies damage, wear, and cleanliness issues

**Comparison Reports:**
- Compares check-in vs check-out inspections
- Highlights changes in condition ratings
- Generates AI summaries of differences
- Useful for security deposit decisions

## API Routes

**Authentication:**
- `POST /api/register` - Register new user (auto-login)
- `POST /api/login` - Login with username/password
- `POST /api/logout` - Logout user
- `POST /api/forgot-password` - Request password reset
- `GET /api/auth/user` - Get current authenticated user

**Organizations:**
- `POST /api/organizations` - Create organization

**Team Management:**
- `GET /api/team` - List team members (owner only)
- `PATCH /api/team/:userId/role` - Update user role (owner only)

**Properties:**
- `POST /api/properties` - Create property
- `GET /api/properties` - List properties

**Units:**
- `POST /api/units` - Create unit
- `GET /api/properties/:propertyId/units` - List units

**Inspections:**
- `POST /api/inspections` - Create inspection
- `GET /api/inspections/my` - Get my inspections
- `GET /api/inspections/:id` - Get inspection details
- `PATCH /api/inspections/:id/status` - Update status

**Inspection Items:**
- `POST /api/inspection-items` - Create inspection item

**AI Analysis:**
- `POST /api/ai/analyze-photo` - Analyze single photo (1 credit)
- `POST /api/ai/generate-comparison` - Generate comparison report (2 credits)
- `GET /api/comparisons/:unitId` - Get comparison reports

**Compliance:**
- `POST /api/compliance` - Upload compliance document
- `GET /api/compliance` - List compliance documents
- `GET /api/compliance/expiring` - Get expiring documents

**Maintenance:**
- `POST /api/maintenance` - Create maintenance request
- `GET /api/maintenance` - List maintenance requests
- `PATCH /api/maintenance/:id` - Update maintenance status

**Credits:**
- `GET /api/credits/transactions` - Get credit history

**Stripe:**
- `POST /api/stripe/create-checkout` - Create Stripe checkout session
- `POST /api/stripe/webhook` - Handle Stripe webhooks

**Object Storage:**
- `POST /api/objects/upload` - Get presigned upload URL
- `PUT /api/objects/set-acl` - Set ACL policy for uploaded object
- `GET /objects/:objectPath` - Download protected object

## Environment Variables

**Database:**
- `DATABASE_URL` - PostgreSQL connection string
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` - Individual DB credentials

**Auth:**
- `SESSION_SECRET` - Session encryption secret (required for Passport.js)
- `NODE_ENV` - Environment (development/production) - affects cookie security settings

**AI:**
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI API base URL (Replit AI Integrations)
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (managed by Replit)

**Stripe:**
- `STRIPE_SECRET_KEY` - Stripe secret key
- `VITE_STRIPE_PUBLIC_KEY` - Stripe publishable key (frontend)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret

**Object Storage:**
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID` - Default bucket ID
- `PUBLIC_OBJECT_SEARCH_PATHS` - Public asset search paths
- `PRIVATE_OBJECT_DIR` - Private object directory

## Design System

**Brand Colors:**
- Navy: #003764 (Primary surfaces/components)
- Fresh Green: #59B677 (Accent/success/CTAs)
- Deep Blue: #000092 (Secondary accent/badges/emphasis)

**Components:**
- Cards: White background, subtle shadows
- Primary Buttons: Navy background
- CTA Buttons: Green background
- Badges: Deep Blue for info, Green for success

**Layout:**
- Left sidebar navigation (role-aware)
- Top bar with sidebar toggle and logout
- Responsive grid layout
- Enterprise-light spacing density

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Database migrations
npm run db:push
npm run db:push --force  # Force sync schema

# Check database
npm run db:studio
```

## Key Files

**Backend:**
- `shared/schema.ts` - Database schema and types (includes users with username/password)
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage interface and implementation
- `server/auth.ts` - Passport.js authentication middleware and endpoints
- `server/objectStorage.ts` - Object storage service
- `server/routes.ts` - API routes (uses req.user.id from Passport)

**Frontend:**
- `client/src/App.tsx` - Main application with auth routing
- `client/src/components/app-sidebar.tsx` - Sidebar navigation
- `client/src/pages/Auth.tsx` - Login/registration page
- `client/src/pages/ForgotPassword.tsx` - Password reset page
- `client/src/pages/OrganizationSetup.tsx` - Onboarding page
- `client/src/pages/Landing.tsx` - Public landing page
- `client/src/hooks/useAuth.ts` - Authentication hook with mutations
- `client/src/index.css` - Design system colors

## User Preferences

- Prioritize PWA-first mobile experience
- Navy/Green/Deep Blue brand color scheme
- Clean, accessible enterprise UI
- Role-based feature access
- Offline support for field inspections

## Recent Changes

- 2025-10-20: **BLOCKS, WORK ORDERS & PWA COMPLETE** - Extended features and PWA foundation
  - Database: Added blocks, inventory_templates, inventories, inventory_items, work_orders, work_logs tables
  - Database: Added contractor role to userRoleEnum; enhanced units table with bedrooms, bathrooms, floor, sqft, status
  - Backend: Full CRUD operations for blocks, inventory management, work orders, work logs
  - Backend: Comprehensive security - organization scoping, Zod validation, role-based access control
  - Backend: Contractor-specific access control (contractors see only their assigned work orders)
  - Frontend: Blocks management page with CRUD operations
  - Frontend: Work Orders management with contractor assignment and status tracking
  - PWA: Created manifest.json with offline config, icons, shortcuts
  - PWA: Implemented service worker with cache-first strategy for app shell and runtime caching
  - PWA: Updated index.html with manifest link and service worker registration
  - Navigation: Updated routing and sidebar for Blocks and Work Orders
  - Auth: Added Contractor role to registration form
- 2025-10-20: **AUTHENTICATION MIGRATION COMPLETE** - Custom username/password auth system
  - Migrated from Replit Auth to Passport.js with local strategy
  - Password hashing with scrypt (built-in Node.js crypto)
  - Session management with express-session + PostgreSQL store
  - Backend endpoints: /api/register, /api/login, /api/logout, /api/forgot-password
  - Frontend pages: Auth.tsx (login/register toggle), ForgotPassword.tsx
  - Updated all 19 API routes to use req.user.id instead of req.user.claims.sub
  - Fixed session cookie security (conditional based on NODE_ENV)
  - Fixed organization creation to preserve user data
  - Complete E2E auth flow tested successfully
  - Database schema: Added username and password fields to users table
- 2025-10-20: **MVP COMPLETE** - All core features implemented and production-ready
  - Inspection detail page with photo upload and AI analysis
  - Real dashboard data aggregation for all roles
  - Compliance dashboard with expiry tracking
  - Tenant portal with secure unit filtering and maintenance requests
  - Backend security: tenant unit ownership validation
  - Frontend security: role-based UI filtering
- 2025-01-XX: Initial project setup with complete backend infrastructure
- 2025-01-XX: Frontend implementation with Dashboard, Properties, and Credits pages
- 2025-01-XX: Integrated OpenAI Vision API for photo analysis
- 2025-01-XX: Implemented Stripe checkout for credit purchases
