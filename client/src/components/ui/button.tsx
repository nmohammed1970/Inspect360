import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 transition-all duration-200 ease-out",
  {
    variants: {
      variant: {
        default:
          "rounded-button bg-primary text-primary-foreground border border-primary-border shadow-xs hover:bg-primary/90 active:bg-primary/85",
        brand:
          "rounded-button text-white font-semibold border-0 shadow-none " +
          "bg-gradient-to-br from-[#2DE0C5] via-[#04C6BD] to-[#00A89A] " +
          "hover:from-[#1FD4B8] hover:via-[#03B4AB] hover:to-[#009688] " +
          "active:from-[#00A89A] active:via-[#009688] active:to-[#007F74]",
        destructive:
          "rounded-button bg-destructive text-destructive-foreground border border-destructive-border shadow-xs hover:bg-destructive/90 active:bg-destructive/85",
        outline:
          "rounded-button border [border-color:var(--button-outline)] bg-background shadow-xs hover:bg-muted/60 active:bg-muted",
        secondary:
          "rounded-button border bg-secondary text-secondary-foreground border-secondary-border hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "rounded-button border border-transparent hover:bg-muted/60 active:bg-muted",
      },
      size: {
        default: "min-h-10 px-4 py-2.5 rounded-button",
        sm: "min-h-9 rounded-button px-3.5 py-2 text-xs",
        lg: "min-h-11 rounded-button px-8 py-2.5",
        icon: "h-10 w-10 rounded-button",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
