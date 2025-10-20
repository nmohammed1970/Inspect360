import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Building2, ClipboardCheck, Sparkles } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-primary mb-4">Inspect360</h1>
          <p className="text-xl text-muted-foreground mb-8">
            AI-Powered Building Inspection Platform for Build-to-Rent Operations
          </p>
          <Button
            size="lg"
            onClick={() => (window.location.href = "/api/login")}
            className="bg-accent hover:bg-accent/90"
            data-testid="button-login"
          >
            Get Started
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <Card className="p-6">
            <Building2 className="w-12 h-12 text-primary mb-4" />
            <h3 className="text-lg font-semibold mb-2">Property Management</h3>
            <p className="text-muted-foreground">
              Manage multiple properties and units with ease
            </p>
          </Card>

          <Card className="p-6">
            <ClipboardCheck className="w-12 h-12 text-primary mb-4" />
            <h3 className="text-lg font-semibold mb-2">Mobile Inspections</h3>
            <p className="text-muted-foreground">
              PWA-ready offline inspections with photo capture
            </p>
          </Card>

          <Card className="p-6">
            <Sparkles className="w-12 h-12 text-accent mb-4" />
            <h3 className="text-lg font-semibold mb-2">AI Analysis</h3>
            <p className="text-muted-foreground">
              AI-powered photo analysis and comparison reports
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
