import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";

export default function Maintenance() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Maintenance</h1>
        <p className="text-muted-foreground">Track and manage maintenance requests</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            Work Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Create and track internal maintenance work orders for your properties.
            Manage priorities, assignments, and completion status.
          </p>
          <Button className="bg-accent hover:bg-accent/90" data-testid="button-create-request">
            Create Maintenance Request
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
