import { Link } from "wouter";
import { Button } from "@/components/ui/button";

/** CTA that opens self-serve pricing (replaces admin credit-request flow). */
export function BuyCreditsButton({
  testId,
  label = "Buy credits",
  size = "sm",
  variant = "default",
}: {
  testId?: string;
  label?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}) {
  return (
    <Button asChild size={size} variant={variant} data-testid={testId}>
      <Link href="/pricing">{label}</Link>
    </Button>
  );
}
