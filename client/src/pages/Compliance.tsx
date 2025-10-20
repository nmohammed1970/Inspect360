import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FileText, Upload, AlertTriangle, ExternalLink, Calendar, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format, differenceInDays, isPast } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertComplianceDocumentSchema, type ComplianceDocument } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";
import { useAuth } from "@/hooks/useAuth";

const DOCUMENT_TYPES = [
  "Fire Safety Certificate",
  "Building Insurance",
  "Electrical Safety Certificate",
  "Gas Safety Certificate",
  "EPC Certificate",
  "HMO License",
  "Planning Permission",
  "Other",
];

const uploadFormSchema = insertComplianceDocumentSchema.extend({
  documentUrl: z.string().min(1, "Please upload a document"),
  expiryDate: z.string().optional(),
});

type UploadFormValues = z.infer<typeof uploadFormSchema>;

export default function Compliance() {
  const [open, setOpen] = useState(false);
  const { user, isLoading: authLoading } = useAuth();

  const { data: documents = [], isLoading } = useQuery<ComplianceDocument[]>({
    queryKey: ['/api/compliance'],
  });

  const { data: expiringDocs = [] } = useQuery<ComplianceDocument[]>({
    queryKey: ['/api/compliance/expiring'],
    queryFn: () => fetch('/api/compliance/expiring?days=90').then(res => res.json()),
  });

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      documentType: "",
      documentUrl: "",
      expiryDate: undefined,
      propertyId: undefined,
      status: "current",
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (data: UploadFormValues) => apiRequest('POST', '/api/compliance', {
      ...data,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/compliance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/compliance/expiring'] });
      setOpen(false);
      form.reset();
    },
  });

  const onSubmit = (data: UploadFormValues) => {
    uploadMutation.mutate(data);
  };

  const getStatusBadge = (doc: ComplianceDocument) => {
    if (!doc.expiryDate) {
      return <Badge variant="secondary" data-testid={`badge-status-${doc.id}`}>No Expiry</Badge>;
    }
    
    const expiryDate = new Date(doc.expiryDate.toString());
    const daysUntilExpiry = differenceInDays(expiryDate, new Date());
    
    if (isPast(expiryDate)) {
      return <Badge variant="destructive" data-testid={`badge-status-${doc.id}`}>Expired</Badge>;
    } else if (daysUntilExpiry <= 30) {
      return <Badge className="bg-yellow-500" data-testid={`badge-status-${doc.id}`}>Expiring Soon ({daysUntilExpiry}d)</Badge>;
    } else if (daysUntilExpiry <= 90) {
      return <Badge className="bg-blue-500" data-testid={`badge-status-${doc.id}`}>Expiring in {daysUntilExpiry}d</Badge>;
    }
    
    return <Badge className="bg-accent" data-testid={`badge-status-${doc.id}`}>Current</Badge>;
  };

  // Check if user has permission to access compliance
  if (authLoading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user || (user.role !== "owner" && user.role !== "compliance")) {
    return (
      <div className="p-8">
        <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <ShieldAlert className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            Access denied. Only organization owners and compliance officers can access this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground" data-testid="heading-compliance">Compliance Center</h1>
          <p className="text-muted-foreground">Manage compliance documents and certifications</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent" data-testid="button-upload-document">
              <Upload className="w-4 h-4 mr-2" />
              Upload Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Upload Compliance Document</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="documentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-document-type">
                            <SelectValue placeholder="Select document type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DOCUMENT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="documentUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Document File</FormLabel>
                      <FormControl>
                        <ObjectUploader
                          onGetUploadParameters={async () => {
                            const response = await fetch('/api/objects/upload', {
                              method: 'POST',
                              credentials: 'include',
                            });
                            const { uploadURL } = await response.json();
                            return {
                              method: 'PUT',
                              url: uploadURL,
                            };
                          }}
                          onComplete={async (result) => {
                            if (result.successful && result.successful[0]) {
                              const uploadURL = result.successful[0].uploadURL;
                              const response = await fetch('/api/objects/set-acl', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ photoUrl: uploadURL }),
                              });
                              const { objectPath } = await response.json();
                              field.onChange(objectPath);
                            }
                          }}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Select Document
                        </ObjectUploader>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiry Date (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          data-testid="input-expiry-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-primary"
                    disabled={uploadMutation.isPending}
                    data-testid="button-submit-document"
                  >
                    {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {expiringDocs.length > 0 && (
        <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            You have {expiringDocs.length} document(s) expiring within 90 days. Please renew them soon.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Loading documents...
            </CardContent>
          </Card>
        ) : documents.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No compliance documents uploaded yet.</p>
              <p className="text-sm text-muted-foreground mt-2">
                Upload your first document to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          documents.map((doc) => (
            <Card key={doc.id} className="hover-elevate" data-testid={`card-document-${doc.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      <span data-testid={`text-document-type-${doc.id}`}>{doc.documentType}</span>
                    </CardTitle>
                    {doc.expiryDate && (
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span data-testid={`text-expiry-date-${doc.id}`}>
                          Expires: {format(new Date(doc.expiryDate.toString()), 'PPP')}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(doc)}
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      data-testid={`button-view-document-${doc.id}`}
                    >
                      <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-1" />
                        View
                      </a>
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  Uploaded {format(new Date(doc.createdAt.toString()), 'PPP')}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
