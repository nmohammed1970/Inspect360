import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // Whitespace-nowrap: Badges should never wrap.
  "whitespace-nowrap inline-flex items-center border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-xs",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-xs",
        success:
          "border-transparent bg-success text-success-foreground shadow-xs",
        warning:
          "border-transparent bg-warning text-warning-foreground shadow-xs",
        info:
          "border-transparent bg-info text-info-foreground shadow-xs",
        outline: " border [border-color:var(--badge-outline)] shadow-xs",
      },
      shape: {
        default: "rounded-md",
        pill: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      shape: "pill",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, shape, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, shape }), className)} {...props} />
  );
}

export { Badge, badgeVariants }
