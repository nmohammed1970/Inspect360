import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";

export default function Inspections() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Inspections</h1>
        <p className="text-muted-foreground">Manage property inspections</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            Inspection Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            This page will allow you to create and manage inspections for your properties.
            Features include check-in, check-out, routine, and maintenance inspections with
            photo capture and AI analysis.
          </p>
          <Button className="bg-accent hover:bg-accent/90" data-testid="button-create-inspection">
            Create New Inspection
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
