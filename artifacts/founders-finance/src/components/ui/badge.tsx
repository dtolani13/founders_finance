import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // @developer tools
  // Whitespace-nowrap: Badges should never wrap.
  "whitespace-nowrap inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" +
  " hover-elevate ",
  {
    variants: {
      variant: {
        default:
          // @developer tools shadow-xs instead of shadow, no hover because we use hover-elevate
          "border-foreground/20 bg-primary text-primary-foreground shadow-xs",
        secondary:
          // @developer tools no hover because we use hover-elevate
          "border-foreground/30 bg-secondary text-secondary-foreground",
        destructive:
          // @developer tools shadow-xs instead of shadow, no hover because we use hover-elevate
          "border-destructive-foreground/20 bg-destructive text-destructive-foreground shadow-xs",
          // @developer tools shadow-xs" - use badge outline variable
        outline: "text-foreground border-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
