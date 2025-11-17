# Inspect360 - AI-Powered Building Inspection Platform

## Overview
Inspect360 is a PWA-first AI-powered building inspection platform for Build-to-Rent (BTR) operations. It aims to streamline property management and enhance operational efficiency through features like role-based access, offline mobile inspections, AI-driven photo analysis and comparison reporting, compliance document tracking with expiry alerts, a dedicated tenant portal, internal maintenance tracking, block-level asset inventory filtering, and a comprehensive subscription system with multi-currency support and credit-based inspections. The platform also includes an AI chatbot with a knowledge base for enhanced user support.

## User Preferences
- Prioritize PWA-first mobile experience
- Inspect360 branded color scheme: Bright Cyan (#00D5CC / HSL 174 100% 42%) primary, Teal (#3B7A8C / HSL 193 40% 38%) accents
- Logo: attached_assets/Inspect360 Logo_1761302629835.png (bright cyan magnifying glass with teal house icon)
- Clean, accessible enterprise UI with generous white space
- Role-based feature access
- Offline support for field inspections

## System Architecture
The platform is built on a robust web architecture with a PWA-first approach, emphasizing a modern, clean design system and branded color palette.

### UI/UX Decisions
- **Modern Clean Design System**: Employs Inter font, clean cards, soft shadows, subtle hover effects, and skeleton loaders with cyan shimmer.
- **Color Scheme**: Bright Cyan for primary CTAs, Teal for accents/links, with white backgrounds and warm gray neutrals.
- **Branding**: Inspect360 logo is prominently displayed.
- **Layout**: Features a responsive left sidebar navigation and a top bar.

### Technical Implementations
- **Frontend**: React with TypeScript, Vite, Wouter, TanStack Query, Shadcn UI, Tailwind CSS, Uppy.
- **Backend**: Express.js, PostgreSQL with Drizzle ORM, Passport.js for authentication.
- **Authentication**: Custom username/password authentication with session management, case-insensitive email handling, and duplicate account detection.
- **Object Storage**: Google Cloud Storage for media files with public ACLs for organization-wide viewing.
- **Database Schema**: Comprehensive schema including users, organizations, properties, blocks, inspections, compliance documents, maintenance requests, asset inventory, contacts, tenant assignments, message templates, and a tagging system.
- **Role-Based Access**: Granular control for various user roles with comprehensive access controls:
  - **Inspection Clerks**: Can only view and complete inspections assigned to them (filtered by `inspectorId`)
  - **Owners/Compliance**: Can view and manage all inspections in their organization
  - **Multi-layer Security**: List filtering + individual inspection authorization checks prevent unauthorized access
- **Credit System**: Stripe-integrated credit-based subscription for AI features with multi-currency support and Eco-Admin pricing management.
- **AI Features**: Integration with OpenAI GPT-5 Vision for photo analysis, comparison reports, maintenance triage, and an AI chatbot with knowledge base integration. Features include:
  - **Context-Aware Photo Analysis**: AI focuses specifically on the inspection point title (e.g., when analyzing "Doors and Handles", the AI ignores other room elements and concentrates only on doors/handles in the photo)
  - **Check-In Photo Reference**: During Check-Out inspections, the system displays corresponding Check-In photos for each field to help inventory clerks match camera angles for accurate comparisons
  - **Intelligent Chatbot**: GPT-5 powered assistant with knowledge base integration for enhanced user support
  - Utilizes Replit AI Integrations
- **PWA**: `manifest.json` and service worker for offline capabilities, caching, and install prompts.
- **Inspection Templates System**: JSON-based templates with a flexible editor, versioning, snapshots, and a visual Template Builder UI. Includes default BTR templates for new organizations.
- **Sample Data on Registration**: Automatic provision of sample data for new organizations.
- **Inspection Capture Workflow**: Comprehensive field inspection workflow with optimistic updates, review pages, status management, native camera capture, and quick actions via a Floating Action Button (FAB).
- **Offline Queue System**: LocalStorage-based offline sync with auto-reconnection and status indicators for inspection entries, assets, and maintenance requests.
- **AI-Powered Tenant Maintenance Requests**: Multi-step tenant portal with AI-powered fix suggestions and image upload.
- **Condition & Cleanliness Ratings**: Configurable per-field ratings in Template Builder.
- **Signature Capture**: Interactive signature pad for inspection sign-offs.
- **Inspection Reports**: Generates formatted HTML reports and server-side PDFs with professional cover pages using Puppeteer.
- **Annual Compliance Calendar**: Visual compliance tracking grid.
- **Block-Level Filtering**: Filtering of properties, asset inventory, and compliance documents.
- **Block Tenant Management**: Comprehensive tenant occupancy tracking and roster management.
- **API Security**: Zod validation and multi-tenant isolation.
- **Tenant Broadcast Messaging**: Block-level communication system with email templates.
- **Inline Tenant Creation**: Property-level tenant assignment with integrated user creation.
- **Collaborative Comparison Reports**: End-to-end check-out inspection comparison with AI analysis, asset-based depreciation, async discussion, electronic signatures, and support for vacant units. Includes "Mark for Review" functionality.
- **Fixflo Integration**: Two-way integration with Fixflo maintenance management system.
- **Auto-Template Selection**: Automatic template selection based on inspection type.
- **Consolidated Maintenance Interface**: Unified page for "Requests" and "Work Orders" with inline creation from inspection reports.
- **Flexible Inspection Status Management**: Editable inspection status dropdown without progress restrictions.
- **Team-Based Work Order Management**: System for work order assignment, notifications, and analytics, featuring atomic team creation/updates, distribution email lists, and category-based routing. Contractor email notifications are supported.
- **AI Chatbot with Knowledge Base**: Comprehensive intelligent help system featuring:
  - **Knowledge Base Management** (Eco-Admin only): Upload and manage PDF, DOCX, and TXT documents with automatic text extraction via pdf-parse and mammoth libraries. Document search and chunking for AI context injection.
  - **AI Chatbot** (all users): Floating button provides universal access to GPT-5 powered assistant. Features conversation history, auto-titled conversations, message persistence, and knowledge base-enhanced responses.
  - **Database Schema**: knowledge_base_documents table for document storage with extracted text; chat_conversations and chat_messages tables for conversation management with role-based messages and source document tracking.
  - **OpenAI Integration**: Uses GPT-5 with proper parameters (max_completion_tokens, no temperature) for main responses and GPT-5-mini for conversation title generation.
  - **Frontend Components**: AIChatbot component with conversation history drawer, message threading, loading states, and error handling. Knowledge Base management UI with Uppy-based document upload.
  - **Session-based Security**: All chat and KB routes use session authentication with multi-tenant isolation.

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