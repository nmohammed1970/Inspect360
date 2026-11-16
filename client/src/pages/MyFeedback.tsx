import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

/** Legacy route — redirect to canonical /feedback */
export default function MyFeedback() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/feedback");
  }, [setLocation]);

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}
