import { useEffect } from "react";
import { useLocation } from "wouter";

/** Credits purchase removed — redirect to read-only Modules page. */
export default function Credits() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/billing");
  }, [setLocation]);
  return null;
}
