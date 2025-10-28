import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, Package, Wrench, X } from "lucide-react";

interface InspectionQuickActionsProps {
  onAddAsset: () => void;
  onLogMaintenance: () => void;
}

export function InspectionQuickActions({
  onAddAsset,
  onLogMaintenance,
}: InspectionQuickActionsProps) {
  const [open, setOpen] = useState(false);

  const handleAction = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div className="fixed bottom-20 right-6 z-50">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            className="h-14 w-14 rounded-full shadow-lg hover-elevate active-elevate-2"
            data-testid="button-quick-actions"
          >
            {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-56 p-2"
          data-testid="menu-quick-actions"
        >
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              onClick={() => handleAction(onAddAsset)}
              data-testid="button-quick-add-asset"
            >
              <Package className="h-5 w-5 text-primary" />
              <div className="flex flex-col items-start">
                <span className="font-medium">Add Asset</span>
                <span className="text-xs text-muted-foreground">
                  Add to inventory
                </span>
              </div>
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              onClick={() => handleAction(onLogMaintenance)}
              data-testid="button-quick-log-maintenance"
            >
              <Wrench className="h-5 w-5 text-primary" />
              <div className="flex flex-col items-start">
                <span className="font-medium">Log Maintenance</span>
                <span className="text-xs text-muted-foreground">
                  Report an issue
                </span>
              </div>
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
