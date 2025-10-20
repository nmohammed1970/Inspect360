import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

export default function Compliance() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Compliance Center</h1>
        <p className="text-muted-foreground">Manage compliance documents and certifications</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Document Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Track compliance documents, certificates, and licenses with expiry alerts.
            Upload and manage important regulatory documentation for your properties.
          </p>
          <Button className="bg-accent" data-testid="button-upload-document">
            Upload Document
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
