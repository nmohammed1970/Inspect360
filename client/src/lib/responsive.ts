/** Shared responsive layout class helpers (Tailwind tokens only). */

/** Standard page padding for main content regions. */
export const pagePad = "p-4 md:p-6";

/** Dialog content: reinforce viewport-safe height/scroll (width comes from DialogContent). */
export const dialogContentBase =
  "min-w-0 max-h-[min(85vh,calc(100dvh-2rem))] overflow-x-hidden overflow-y-auto";

/** Sticky dialog footer for long forms on short screens. */
export const dialogFooterSticky =
  "sticky bottom-0 z-10 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 mt-2 border-t bg-background px-4 sm:px-6 py-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";

/** Form field grids that stack on mobile. */
export const formGrid2 = "grid grid-cols-1 sm:grid-cols-2 gap-4";

/**
 * Dense entity card grids (blocks, properties, inspections, etc.).
 * Stay single-column until lg so two cards never crush on short/narrow laptops.
 */
export const cardGrid =
  "grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 items-stretch";

/** Same as cardGrid with slightly larger gaps for taller cards (blocks). */
export const cardGridComfortable =
  "grid grid-cols-1 gap-6 lg:gap-8 lg:grid-cols-2 xl:grid-cols-3 items-stretch";

/** Horizontally scrollable tabs row without wrapping collisions. */
export const tabsListScroll =
  "inline-flex h-auto min-h-10 w-full max-w-full justify-start overflow-x-auto flex-nowrap";

/** Tab trigger: keep icon, hide label text on very narrow viewports. */
export const tabTriggerResponsive =
  "shrink-0 gap-1.5 px-2.5 sm:px-3 [&_svg]:shrink-0 [&_span.tab-label]:hidden sm:[&_span.tab-label]:inline";

/** Truncate long single-line labels with ellipsis. */
export const textTruncate = "truncate min-w-0";

/** Break long words in multi-line cells. */
export const textBreak = "break-words min-w-0";
