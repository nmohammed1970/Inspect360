# Inspect360 - AI-Powered Building Inspection Platform

## Overview
Inspect360 is a PWA-first AI-powered building inspection platform designed to optimize Build-to-Rent (BTR) operations. It offers features such as role-based access, offline mobile inspections, AI-driven photo analysis and comparison reporting, compliance tracking with expiry alerts, a dedicated tenant portal, internal maintenance tracking, and a comprehensive subscription system with multi-currency support. The platform aims to streamline property management and enhance operational efficiency through its advanced AI capabilities and user-centric design.

## User Preferences
- Prioritize PWA-first mobile experience
- Inspect360 branded color scheme: Bright Cyan (#00D5CC / HSL 174 100% 42%) primary, Teal (#3B7A8C / HSL 193 40% 38%) accents
- Logo: attached_assets/Inspect360 Logo_1761302629835.png (bright cyan magnifying glass with teal house icon)
- Clean, accessible enterprise UI with generous white space
- Role-based feature access
- Offline support for field inspections

## System Architecture
The platform is built on a robust web architecture with a PWA-first approach, emphasizing a modern design system and branded color palette.

### UI/UX Decisions
- **Modern Clean Design System**: Utilizes Inter font, clean cards, soft shadows, subtle hover effects, and skeleton loaders with cyan shimmer.
- **Color Scheme**: Bright Cyan for primary CTAs, Teal for accents/links, with white backgrounds and warm gray neutrals.
- **Branding**: Prominent Inspect360 logo, responsive left sidebar navigation, and a top bar.

### Technical Implementations
- **Frontend**: React with TypeScript, Vite, Wouter, TanStack Query, Shadcn UI, Tailwind CSS.
- **Backend**: Express.js, PostgreSQL with Drizzle ORM, Passport.js for authentication.
- **Authentication**: Custom username/password authentication with session management, role-based access, and automated organization provisioning for self-registrations.
- **Object Storage**: Google Cloud Storage for media files.
- **Database Schema**: Comprehensive schema covering users, organizations, properties, inspections, compliance, maintenance, assets, and more.
- **Role-Based Access**: Granular control ensuring multi-layer security and data isolation for different user roles (e.g., Inspection Clerks, Owners).
- **Credit System**: Stripe-integrated, credit-based subscription model with multi-currency support and an Eco-Admin dashboard for plan and bundle management. New registrations receive 10 free inspection credits.
- **AI Features**: Integration with OpenAI GPT-5 Vision for context-aware photo analysis, comparison reporting, maintenance triage, and an intelligent chatbot with knowledge base integration.
- **PWA**: `manifest.json` and service worker for offline capabilities, caching, and install prompts.
- **Inspection Templates System**: JSON-based templates with a flexible editor, versioning, and default BTR templates. Supports auto-populated fields (Inspector, Address, Tenant Names, Inspection Date) that automatically draw information from the inspection context and save on first render without overwriting existing values.
- **Inspection Capture Workflow**: Comprehensive field inspection workflow with optimistic updates, review pages, native camera capture, and quick actions.
- **Offline Queue System**: LocalStorage-based offline sync for inspection entries, assets, and maintenance requests.
- **AI-Powered Tenant Maintenance Requests**: Multi-step tenant portal with AI-powered fix suggestions and image upload.
- **Compliance Document Upload System**: Robust system with multi-layer error handling, state management, user feedback, and calendar popover for expiry dates.
- **Separate Inspection and Compliance Schedules**: "Inspection Schedule" tab shows annual inspection compliance calendar by template type. "Compliance Schedule" tab shows document expiry calendar with document management.
- **Collaborative Comparison Reports**: End-to-end check-out inspection comparison with AI analysis, asset-based depreciation, and electronic signatures.
- **Team-Based Work Order Management**: System for work order assignment, notifications, and analytics with contractor email support.
- **AI Chatbot with Knowledge Base**: Features knowledge base management (uploading PDF, DOCX, TXT), a GPT-5 powered chatbot with conversation history, and knowledge base-enhanced responses.
- **Tag-Based Filtering System**: Reusable component for multi-select tag filtering across Blocks, Properties, and Tenant Assignments.
- **Professional BTR Reports System**: Centralized reports hub with fully functional Inspections and Blocks reports, multi-criteria filtering, summary statistics, and server-side PDF export with branded cover pages using Puppeteer.
- **Tenant Portal**: Dedicated PWA-first portal with separate authentication, a home dashboard, an AI preventative maintenance chatbot, and maintenance request tracking.
- **First-Time User Onboarding**: Beautiful swipeable 5-screen onboarding experience for new users with Inspect360 branding, feature highlights, and smooth Embla carousel transitions. Only appears on first login; completion is persisted to the database.
- **Feedback & Feature Request System**: Complete user feedback system with dialog-based submission form (title, description, priority, category), user feedback history page ("My Feedback" in sidebar), and comprehensive Eco-Admin management panel with status counts, multi-criteria filtering (status/category/priority), status updates with resolution notes, and automatic email notifications to the central team on new submissions.
- **White-Labeling System**: Complete organization branding customization with logo upload (stored in Google Cloud Storage), company name, contact details (email, phone, website, address). Branding appears in sidebar navigation, PDF inspection reports (cover page with logo and contact info), and throughout portals. Configured during onboarding with a dedicated "Customize Your Brand" step, and editable anytime via Settings > Company Branding tab. URL sanitization ensures security in PDF generation.

## External Dependencies
- **PostgreSQL (Neon)**: Primary database.
- **OpenAI Vision API**: AI photo analysis, comparison, and chatbot.
- **Stripe**: Payment processing for subscriptions and credits.
- **Google Cloud Storage**: Object storage for media files.
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