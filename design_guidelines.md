# Inspect360 Design Guidelines

## Design Approach
**System:** Custom enterprise design system based on brand colors extracted from logo. Clean, accessible, enterprise-focused UI optimized for PWA and mobile-first inspection workflows.

## Core Brand Colors

- **Navy:** #003764 (brand primary - use for primary surfaces/components)
- **Fresh Green:** #59B677 (accent/success/CTA highlights - positive states and primary CTAs)
- **Deep Blue:** #000092 (secondary accent for emphasis/badges/data accents)
- **Black:** #000000 (text on light backgrounds)
- **Surface Base:** #ffffff (white backgrounds for readability and clean enterprise feel)
- **Surface Muted:** #f6f8fa (subtle backgrounds)

## Tailwind Theme Extension

```
theme: {
  extend: {
    colors: {
      brand: {
        navy: '#003764',
        green: '#59B677',
        deep: '#000092',
        black: '#000000'
      },
      surface: {
        base: '#ffffff',
        muted: '#f6f8fa'
      }
    },
    boxShadow: {
      card: '0 6px 24px rgba(0,0,0,0.08)'
    },
    borderRadius: {
      xl2: '1rem'
    }
  }
}
```

## Component Specifications

**Cards:** White background, rounded-xl2, shadow-card, subtle borders on muted surfaces

**Primary Button:** Navy background, white text, hover: slightly darker navy, focus ring green

**Secondary Button:** Outline navy or deep blue, hover: tint fill

**CTA Buttons (Tenant/Submit):** Green background, white text, bold, short labels

**Inputs:** Large hit-areas, labels always visible, helpful text below

**Badges/Status:** Deep blue for info, green for success, amber for warnings, red for critical

**Charts:** Single-color emphasis (deep blue) with green highlights for positives

**Icons:** Simple line icons via Heroicons, avoid clutter, use navy stroke

## Layout System

**Navigation:** Persistent left rail with role-aware nav

**Top Bar:** Search, quick actions ("New Inspection"), org switcher, user menu

**Content Grid:** Responsive 12-column grid, cards snap to 4/6/12 spans

**Spacing:** Enterprise-light density with ample whitespace - Tailwind units of 2, 4, 6, 8, 12, 16 (e.g., p-4, h-8, m-6, py-12)

## Typography

Use system font stack for performance and familiarity in enterprise context

## Key Screens Structure

1. **Auth/Registration:** Create org → invite team → Stripe connection (deferred)
2. **Role Onboarding:** Owner checklist (add block → properties → inventory → clerks → schedule)
3. **Owner Dashboard:** KPIs (credits, inspections due, expiring compliance, maintenance, AI flags)
4. **Clerk "My Day" (PWA):** Assigned inspections, offline sync, one-tap start, photo capture, sliders
5. **Compliance Center:** Expiring docs (30/60/90), upload flows, rule tracking
6. **Tenant Portal:** New request → track status → view comparison → comment thread

## Accessibility & Motion

- Color contrast ≥ 4.5:1 (navy/green on white is compliant)
- Focus rings visible (green)
- Motion minimal: micro-transitions on hover/press only
- Keyboard + screen-reader friendly with semantic headings and ARIA for status

## UI Microcopy Tone

- Primary CTAs: "Start Inspection", "Create Comparison", "Log Maintenance"
- Empty states: "No inspections today—schedule one or enjoy the calm."
- Alerts: "Inspection credits low – upgrade to avoid blocking submissions."

## Images

**Dashboard/Hero Sections:** Use professional building/property inspection imagery showing modern BTR facilities, inspection tools, or clean property interiors to establish credibility and context.