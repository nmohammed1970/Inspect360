import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClearFiltersButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
  "data-testid"?: string;
}

/** Matches Operations Dashboard clear-filter control (ghost + XCircle). */
export const ClearFiltersButton = forwardRef<HTMLButtonElement, ClearFiltersButtonProps>(
  function ClearFiltersButton(
    {
      onClick,
      label = "Clear Filters",
      className,
      "data-testid": testId = "button-clear-filters",
    },
    ref,
  ) {
    return (
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClick}
        className={cn(className)}
        data-testid={testId}
      >
        <XCircle className="h-4 w-4 mr-1" />
        {label}
      </Button>
    );
  },
);
