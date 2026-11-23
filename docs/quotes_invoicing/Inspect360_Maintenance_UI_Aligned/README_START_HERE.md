# Inspect360 Maintenance — Design-Aligned Developer Handover
**Version 2.0 | 20 November 2026**

This revision preserves the original maintenance process, workflow, security rules and 25 functional tests, but **updates all four screen designs to match the user-supplied Inspect360 HMO overview**.

## Files

1. `Inspect360_Maintenance_Process_Flow_Developer_Handover.docx` — Word functional process + UI/style instructions + updated screen previews and original design screenshot.
2. `Inspect360_Maintenance_Cursor_Implementation_Brief.md` — main Cursor Pro technical brief; new **Section 0** is mandatory UI design contract, plus existing requirements and acceptance tests.
3. `Inspect360_Maintenance_Screen_Prototype.html` — navigable, desktop-responsive reference; local demo interactions only, not a functional connected application.
4. `screens/` — matching 4 PNG mockups: quote, invoice, completion, final record.
5. `Inspect360_Maintenance_Process_Flow.png` — light-theme end-to-end flow diagram.
6. `Inspect360_HMO_Overview_UI_Reference.png` — supplied original HMO screenshot to compare visual style against.

## Instructions for developer

- Place the `.md` file in your Inspect360 repository and open it in Cursor Pro.
- Read Section 0 first; **audit the existing Inspect360 design system and components** before coding.
- Reuse current navigation, headers, cards, typography, buttons, alert patterns and authorisation controls.
- Review HTML screens and PNGs, then integrate their layouts into existing app components; do not paste the standalone demo page into production.
- Implement server-side quote, invoice, checklist, photo, allocation and workflow rules and preserve existing data.
- Demo uses illustrative 39 Park Avenue, Potters Bar EN6 5NL context to match screenshot. No live data is asserted.
- Validate the 25 functional scenarios plus screenshot/style QA at 1564×960 and 390×844.

**Important:** the light-blue `Interactive design concept` ribbon appears only in the prototype, and the floating chat overlay in the screenshot is not Inspect360 UI. Neither belongs in the production application.
