import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { recordNavigationToDetail } from "./navContext";
import type { NavTrailEntry } from "./types";

type ContextualLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  /** Label for the current page when recording trail (e.g. "Properties") */
  fromLabel: string;
  /** Optional full trail; defaults to single entry from current location */
  trail?: NavTrailEntry[];
  children: ReactNode;
};

/**
 * Link that records NavContext before navigating to a detail resource.
 */
export function ContextualLink({
  href,
  fromLabel,
  trail,
  onClick,
  children,
  ...rest
}: ContextualLinkProps) {
  const [location] = useLocation();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    recordNavigationToDetail({
      targetHref: href,
      fromPath: location,
      fromLabel,
      trail,
    });
    onClick?.(e);
  };

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}

/**
 * Imperative navigate that records context (for buttons / programmatic nav).
 */
export function navigateWithContext(
  navigate: (to: string) => void,
  opts: {
    href: string;
    fromPath: string;
    fromLabel: string;
    trail?: NavTrailEntry[];
  },
) {
  recordNavigationToDetail({
    targetHref: opts.href,
    fromPath: opts.fromPath,
    fromLabel: opts.fromLabel,
    trail: opts.trail,
  });
  navigate(opts.href);
}
