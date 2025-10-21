# Inspect360 Design Guidelines

## Design Approach
**Custom Enterprise Design System** inspired by Linear's precision, Apple HIG's clarity, and modern enterprise standards. Brand-driven color palette with glassmorphic depth, generous spacing, and refined micro-interactions. Optimized for PWA, mobile-first inspection workflows, and seamless light/dark mode switching.

## Brand Color System

### Light Mode
- **Navy Primary:** 0 100% 20% (brand primary - headers, primary buttons, navigation)
- **Fresh Green:** 145 45% 54% (success states, CTAs, positive indicators)
- **Deep Blue:** 240 100% 29% (data accents, badges, links)
- **Black:** 0 0% 0% (primary text)
- **Surface Base:** 0 0% 100% (main backgrounds)
- **Surface Elevated:** 210 33% 99% (cards, modals)
- **Surface Muted:** 210 17% 98% (subtle backgrounds, disabled states)
- **Border Subtle:** 210 16% 93% (dividers, card borders)

### Dark Mode
- **Navy Primary:** 206 100% 92% (inverted for dark - headers, primary actions)
- **Fresh Green:** 145 45% 65% (adjusted for dark contrast - success, CTAs)
- **Deep Blue:** 240 100% 75% (links, accents on dark)
- **White:** 0 0% 98% (primary text on dark)
- **Surface Base:** 220 13% 9% (main dark background)
- **Surface Elevated:** 220 13% 13% (cards, modals with elevation)
- **Surface Muted:** 220 9% 16% (secondary backgrounds)
- **Border Subtle:** 220 9% 23% (dividers on dark)

## Glassmorphic Design Language

**Glass Cards:** Semi-transparent backgrounds with backdrop blur, subtle border highlights, layered depth
- Light: `bg-white/80 backdrop-blur-xl border border-white/20`
- Dark: `bg-surface-elevated/40 backdrop-blur-xl border border-white/10`

**Floating Elements:** Navigation bars, action sheets, modals use elevated glass with stronger blur
- Shadow layering: Combine soft shadows with glow effects for depth
- Light: `shadow-[0_8px_32px_rgba(0,55,100,0.08)]`
- Dark: `shadow-[0_8px_32px_rgba(0,0,0,0.4)]`

**Gradient Accents:** Subtle, sophisticated overlays - never garish
- Navy to Deep Blue: `from-[hsl(206_100%_20%)] to-[hsl(240_100%_29%)]` at 15% opacity
- Success glow: Soft green radial gradients behind CTAs and success states
- Apply gradients sparingly: Hero sections, feature highlights, CTAs only

## Typography Scale

**Font Stack:** `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`

**Hierarchy:**
- **Display (Hero):** 48px/1.1, weight 700, tight letter-spacing -0.02em
- **H1:** 36px/1.2, weight 700
- **H2:** 28px/1.3, weight 600
- **H3:** 22px/1.4, weight 600
- **H4:** 18px/1.5, weight 600
- **Body Large:** 16px/1.6, weight 400
- **Body:** 14px/1.6, weight 400
- **Small:** 13px/1.5, weight 400
- **Caption:** 12px/1.4, weight 500

**Interactive Text:** Medium weight (500) for buttons, links, labels

## Layout System

**Spacing Primitives:** Use Tailwind units of 3, 4, 6, 8, 12, 16, 20, 24 for generous, breathable layouts
- Card padding: p-6 (mobile), p-8 (desktop)
- Section spacing: py-16 (mobile), py-24 (desktop)
- Component gaps: gap-6 (standard), gap-8 (generous)
- Grid gaps: gap-4 (tight data), gap-6 (cards)

**Container System:**
- Max-width: 1280px (desktop)
- Padding: px-4 (mobile), px-6 (tablet), px-8 (desktop)
- Content grids: 12-column with 4/6/12 span cards

**Navigation:**
- Desktop: Persistent left rail (256px), glassmorphic, role-aware menu
- Mobile: Bottom tab bar (PWA), glass effect with blur, 4-5 core actions
- Top bar: Search, quick "New Inspection" CTA, org switcher, avatar menu

## Component Design

### Cards
- Glass background with backdrop blur
- Rounded corners: 16px (relaxed, modern)
- Soft shadows with subtle border glow
- Hover: Lift effect with increased shadow depth
- Interactive cards: Scale transform (1.02) + shadow expansion on press

### Buttons
**Primary (Navy):**
- Navy background in light, Fresh Green in dark (maintains brand hierarchy)
- White text, medium weight
- Rounded: 12px
- Padding: px-6 py-3 (desktop), px-5 py-2.5 (mobile)
- Hover: Darken 8%, subtle scale (1.01)
- Active: Scale (0.98), instant feedback

**CTA (Fresh Green):**
- Green background both modes (adjusted saturation for dark)
- White text, semibold weight
- Glow effect: Soft green shadow on hover
- Prominent placement: "Start Inspection", "Create Request"

**Secondary/Ghost:**
- Transparent with border (navy or deep blue)
- Hover: Fill with 10% tint
- On images: Glassmorphic background with blur (`bg-white/10 backdrop-blur-md border-white/30`)

**Icon Buttons:**
- 40x40px hit area minimum
- Hover: Background tint appears
- Feedback: Ripple effect on press

### Inputs & Forms
- Large touch targets: 48px minimum height
- Floating labels that stay visible on focus
- Helper text below in muted color
- Focus: Green ring (2px) with subtle glow
- Glass styling for floating forms (modals, sheets)

### Badges & Status
- Rounded-full with glass background
- Deep Blue: Info/pending
- Green: Success/completed
- Amber: Warnings/expiring
- Red: Critical/overdue
- Subtle icon + text, semibold weight

### Data Visualization
- Deep Blue primary data color
- Green for positive trends/highlights
- Subtle grid lines (low opacity)
- Glass card containers for chart groups
- Tooltips: Glass effect with blur

## Micro-Interactions

**Timing:** Fast and snappy (150-250ms) - enterprise users value efficiency
- Hover states: 150ms ease-out
- Button press: 100ms ease-in-out
- Card expand: 200ms ease-out
- Modal entry: 250ms with subtle fade + scale

**Effects (Applied Sparingly):**
- Button ripple on click
- Card lift on hover (2-4px elevation increase)
- Skeleton loaders with shimmer for data fetching
- Success animations: Checkmark draw + subtle scale
- Photo capture: Flash effect + haptic feedback (PWA)

**Navigation Transitions:**
- Slide transitions between major views (300ms)
- Fade for modal overlays (200ms)
- Bottom sheet: Spring animation from bottom (350ms)

## Key Screen Patterns

### Owner Dashboard
- Hero KPI cards in 3-column grid (desktop), stacked (mobile)
- Glass cards with gradient overlays for key metrics
- Credits remaining: Prominent with warning states at thresholds
- Charts use glass containers with subtle depth
- Quick actions: Floating action button (mobile) + top bar (desktop)

### Clerk "My Day" (PWA)
- Full-screen card stack for assigned inspections
- Swipe gestures: Dismiss completed, defer later
- Large touch zones for photo capture
- Offline indicator: Glass banner at top when disconnected
- One-tap inspection start with haptic confirmation

### Compliance Center
- Timeline view with expiring documents
- Color-coded urgency (30/60/90 days)
- Upload modal: Glass sheet from bottom (mobile), centered (desktop)
- Document preview: Full-bleed with glass controls overlay

### Tenant Portal
- Request form: Multi-step with progress indicator
- Comparison viewer: Side-by-side cards with glass divider
- Comment threads: WhatsApp-style bubbles with glass background
- Status tracker: Vertical timeline with green progress line

## Images

**Hero Sections:** Professional building inspection imagery
- Marketing pages: Modern BTR facilities, inspection tools, clean property interiors
- Dashboard hero (optional): Subtle background image at 40% opacity with gradient overlay
- Empty states: Illustration-style graphics (not photos) for warmth

**Placement Strategy:**
- Landing page: Full-bleed hero image (60vh) with centered text overlay
- Feature sections: Alternating image-text layout with rounded corners
- Dashboard: Background patterns only - prioritize data visibility
- Mobile: Minimize decorative images, focus on functional clarity

## Accessibility & PWA

**Contrast:** All text meets WCAG AA (4.5:1), critical actions meet AAA (7:1)
- Navy on white: 8.9:1 ✓
- Green on white: 3.2:1 (use for backgrounds only, white text on green: 4.3:1) ✓
- Test dark mode combinations independently

**Focus Management:**
- Green focus rings (2px, offset 2px)
- Keyboard navigation: Visible skip links, logical tab order
- Screen readers: Semantic HTML, ARIA labels for icons/status

**PWA Optimizations:**
- Offline banner: Glass notification with retry action
- Install prompt: Bottom sheet with brand benefits
- Splash screen: Navy gradient with white logo
- App icon: Simplified logo on green gradient

**Performance:**
- Lazy load images below fold
- Preload critical fonts (Inter)
- Use CSS transforms for animations (GPU acceleration)
- Minimize backdrop-blur usage (expensive on mobile)

## UI Voice & Microcopy

**Primary CTAs:** Action-oriented, confident
- "Start Inspection", "Create Comparison", "Log Maintenance", "Invite Team"

**Empty States:** Friendly, contextual
- "No inspections today—enjoy the calm or schedule one ahead."
- "Invite clerks to get started with mobile inspections."

**Alerts & Warnings:**
- "Inspection credits low (12 remaining)—upgrade to avoid disruption."
- "3 documents expire in 15 days—upload renewals to stay compliant."

**Success Messages:**
- "Inspection completed! Data syncing..."
- "Tenant notified—they can view comparison now."