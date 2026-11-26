import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STILL_PREPARING_AFTER_MS = 15_000;

export interface PdfActionButtonProps extends ButtonProps {
  pending: boolean;
  pendingLabel?: string;
  stillPendingLabel?: string;
}

/**
 * PDF action that shows an indeterminate bar for the whole request.
 * The server does not report a percent, so the bar never fills toward 100.
 */
export const PdfActionButton = React.forwardRef<HTMLButtonElement, PdfActionButtonProps>(
  (
    {
      pending,
      pendingLabel = "Preparing PDF…",
      stillPendingLabel = "Still preparing…",
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const [stillWaiting, setStillWaiting] = React.useState(false);

    React.useEffect(() => {
      if (!pending) {
        setStillWaiting(false);
        return;
      }
      const timer = window.setTimeout(() => setStillWaiting(true), STILL_PREPARING_AFTER_MS);
      return () => window.clearTimeout(timer);
    }, [pending]);

    const label = stillWaiting ? stillPendingLabel : pendingLabel;

    return (
      <Button
        ref={ref}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        className={cn("relative overflow-hidden", pending && "disabled:opacity-100", className)}
        {...props}
      >
        {pending ? <span aria-live="polite">{label}</span> : children}
        {pending ? (
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
            aria-hidden="true"
          >
            <span className="absolute inset-0 bg-foreground" style={{ opacity: 0.2 }} />
            <span className="absolute inset-y-0 left-0 w-2/5 bg-foreground motion-safe:animate-pdf-indeterminate motion-reduce:w-full motion-reduce:animate-pdf-indeterminate-pulse" />
          </span>
        ) : null}
      </Button>
    );
  },
);
PdfActionButton.displayName = "PdfActionButton";
