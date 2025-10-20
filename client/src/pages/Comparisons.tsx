import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

export default function Comparisons() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Comparison Reports</h1>
        <p className="text-muted-foreground">AI-powered check-in vs check-out comparisons</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent" />
            Inspection Comparisons
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Generate AI-powered comparison reports between check-in and check-out inspections.
            Identify changes in condition, damage, and cleanliness to support security deposit decisions.
          </p>
          <Button className="bg-accent" data-testid="button-generate-comparison">
            Generate Comparison Report
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
