# Inspect360 Design Guidelines

## Design Approach
**Modern SaaS Design System** inspired by Linear's clarity, Notion's airiness, and contemporary dashboard aesthetics. Bright cyan and teal brand palette from the Inspect360 logo with clean white surfaces, soft shadows, and generous breathing room. PWA-optimized for mobile-first inspection workflows with seamless light/dark mode transitions. Professional, calming, and effortlessly modern.

## Color System

### Light Mode (Primary)
- **Bright Cyan Primary:** 174 100% 42% (#00D5CC - brand primary from Inspect360 logo, CTAs, primary buttons)
- **Teal Accent:** 193 40% 38% (#3B7A8C - from Inspect360 logo house, links, interactive elements)
- **Powder Cyan Background:** 174 30% 97% (subtle surface tints, hover states)
- **White Surface:** 0 0% 100% (main backgrounds, cards)
- **Warm Gray 50:** 30 10% 98% (alternative surface, subtle sections)
- **Warm Gray 200:** 30 8% 90% (borders, dividers)
- **Warm Gray 600:** 30 5% 45% (secondary text)
- **Warm Gray 900:** 30 8% 15% (primary text, headings)

### Dark Mode
- **Bright Cyan Primary:** 174 100% 48% (adjusted brightness for dark contrast)
- **Teal Accent:** 193 40% 45% (links, accents on dark)
- **Dark Surface Base:** 220 15% 12% (main background)
- **Dark Surface Elevated:** 220 13% 16% (cards, modals)
- **Dark Surface Subtle:** 220 10% 20% (hover states, sections)
- **Dark Border:** 220 10% 25% (dividers)
- **Gray 400:** 30 5% 70% (secondary text on dark)
- **Gray 50:** 0 0% 98% (primary text on dark)

## Typography

**Font:** Inter, system-ui, sans-serif

**Scale:**
- **Display:** 48px/1.1, weight 600, -0.02em tracking
- **H1:** 36px/1.2, weight 600
- **H2:** 28px/1.3, weight 600
- **H3:** 22px/1.4, weight 600
- **H4:** 18px/1.5, weight 500
- **Body Large:** 16px/1.6, weight 400
- **Body:** 15px/1.6, weight 400
- **Small:** 14px/1.5, weight 400
- **Caption:** 13px/1.4, weight 500

## Layout System

**Spacing Primitives:** Tailwind units 3, 4, 6, 8, 12, 16, 20, 24
- Card padding: p-6 (mobile), p-8 (desktop)
- Section spacing: py-12 (mobile), py-20 (desktop)
- Component gaps: gap-6 standard, gap-8 generous
- Grid gaps: gap-4 (compact), gap-6 (relaxed)

**Container:** Max 1280px, px-4 (mobile), px-6 (tablet), px-8 (desktop)

**Navigation:**
- Desktop: Left sidebar 256px, clean white with sky blue active states
- Mobile: Bottom tab bar (PWA), sky blue icons for active
- Top bar: Search, "New Inspection" CTA, org switcher, avatar

## Component Design

### Cards
- White background (light) / Dark elevated (dark)
- Border radius: 0.75rem (12px)
- Soft shadow: `shadow-[0_2px_8px_rgba(0,0,0,0.04)]` (light), `shadow-[0_2px_12px_rgba(0,0,0,0.3)]` (dark)
- Border: 1px warm-gray-200 (light) / dark-border (dark)
- Hover: Lift shadow `shadow-[0_4px_16px_rgba(0,0,0,0.08)]`, translate -1px

### Buttons
**Primary (Sky Blue):**
- Sky blue background, white text, weight 500
- Pill-shaped: `rounded-full`
- Padding: px-6 py-3 (desktop), px-5 py-2.5 (mobile)
- Hover: Darken to `199 79% 56%`, no scale
- Active: Darken further to `199 79% 50%`

**Secondary:**
- Cobalt text, transparent background, cobalt border (1px)
- Pill-shaped, same padding
- Hover: Powder blue background fill

**Ghost on Images:**
- White/10 background, white text, white/30 border
- Backdrop blur: `backdrop-blur-md`
- No custom hover states (inherits Button defaults)

**Icon Buttons:** 44x44px minimum, circular, hover fills with powder blue

### Inputs
- 48px height minimum (touch-friendly)
- Rounded: 0.75rem (matches cards)
- Border: warm-gray-200, focus ring sky blue (2px)
- Floating labels, permanent visibility on focus
- Helper text: warm-gray-600

### Badges
- Pill-shaped (`rounded-full`), px-3 py-1
- Sky blue: General info/pending
- Cobalt: Links, clickable
- Green (145 60% 50%): Success/completed
- Amber (35 90% 55%): Warnings
- Red (0 80% 55%): Critical

### Data Displays
- Charts: Cobalt primary, sky blue secondary
- Tables: Alternating row tint (powder blue/5%)
- Minimal grid lines (warm-gray-200)

## Visual Language

**Shadows:** Soft, layered depth
- Resting cards: 0_2px_8px_rgba(0,0,0,0.04)
- Hover cards: 0_4px_16px_rgba(0,0,0,0.08)
- Modals: 0_8px_32px_rgba(0,0,0,0.12)
- Floating elements: 0_12px_48px_rgba(0,0,0,0.15)

**Spacing Philosophy:** Generous whitespace, never cramped
- Minimum 24px between major sections
- Card groups: gap-6 default
- Dense data tables: Tighter spacing acceptable (gap-3)

**Micro-Interactions:**
- Fast, subtle: 150ms transitions
- Button press: No scale transforms (clean, direct)
- Card hover: Subtle lift only
- Loading: Skeleton shimmer (sky blue tint)
- Success: Checkmark draw + green badge fade-in

## Key Screens

### Dashboard (Owner)
- Hero: Full-width image (60vh) of modern BTR property, soft gradient overlay (white to transparent), centered white text with shadow
- KPI cards: 3-column grid (desktop), white cards with sky blue accent bars on left edge
- Credits widget: Prominent sky blue card with cobalt badge for count
- Charts: Cobalt lines/bars in white card containers

### Clerk Mobile (PWA)
- Full-screen card stack for inspections
- Large sky blue "Start Inspection" pill button
- Swipe gestures for completion
- Photo capture: White overlay controls with backdrop blur
- Offline banner: Sky blue with white text

### Compliance Center
- Timeline: Vertical with cobalt connecting line
- Document cards: White with colored left border (green=ok, amber=soon, red=overdue)
- Upload modal: Bottom sheet (mobile), centered modal (desktop), white with soft shadow

### Tenant Portal
- Multi-step form: Sky blue progress dots
- Comparison viewer: Side-by-side white cards, cobalt divider
- Comments: WhatsApp-style bubbles, sky blue for user, warm-gray-50 for others

## Images

**Placement:**
- Landing hero: Full-bleed professional building photo (60vh), white text overlay, gradient fade to white
- Feature sections: Alternating layout, rounded 0.75rem images
- Dashboard: Optional subtle background pattern (10% opacity max)
- Empty states: Simple line illustrations in sky blue/cobalt
- Mobile: Minimize decorative images, functional clarity prioritized

**Style:** Clean, bright professional photography of modern buildings, inspection tools, well-maintained interiors

## Accessibility

**Contrast:** WCAG AA minimum
- Sky blue on white: 3.1:1 (backgrounds only, use white text on sky blue: 4.8:1)
- Cobalt on white: 4.5:1 ✓
- Warm-gray-900 on white: 12:1 ✓

**Focus:** Sky blue ring (2px), offset 2px, visible on all interactive elements

**PWA:** 
- Offline banner at top (sky blue)
- Install prompt: Bottom sheet with sky blue CTA
- Splash: White background, sky blue logo
- App icon: Sky blue gradient

## Voice & Microcopy

**CTAs:** "Start Inspection", "Create Comparison", "Upload Documents", "Invite Team"

**Empty:** "No inspections scheduled—create one to get started."

**Alerts:** "12 credits remaining—consider upgrading to avoid interruption."

**Success:** "Inspection complete! Syncing data..."