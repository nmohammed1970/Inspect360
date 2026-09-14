import { useEffect } from "react";
import { useLocation } from "wouter";

/** Marketplace purchases removed — redirect to read-only Modules page. */
export default function Marketplace() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/billing");
  }, [setLocation]);
  return null;
}
