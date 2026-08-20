import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Home, ImagePlus, Loader2, MapPin, Sparkles, X } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";

interface TenantLogRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccessNavigate?: () => void;
}

export function TenantLogRequestDialog({
  open,
  onOpenChange,
  onSuccessNavigate,
}: TenantLogRequestDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const { data: tenancyData } = useQuery<any>({
    queryKey: ["/api/tenant/tenancy"],
    enabled: open,
  });

  const property = tenancyData?.property;
  const hasTenancy = !!tenancyData?.tenancy?.propertyId;

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setPhotoUrls([]);
    setAiSuggestions("");
    setIsAnalyzing(false);
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const analyzeMutation = useMutation({
    mutationFn: async ({ imageUrl, issueDescription }: { imageUrl: string; issueDescription: string }) => {
      const res = await apiRequest("POST", "/api/maintenance/analyze-image", {
        imageUrl,
        issueDescription,
      });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setAiSuggestions(data.suggestedFixes || "");
      toast({
        title: "AI Analysis Complete",
        description: "Review the suggested fixes below",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze image",
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tenant/maintenance-requests", {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
        aiSuggestedFixes: aiSuggestions || undefined,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Request submitted",
        description: property?.name
          ? `Logged against ${property.name}. Your property manager has been notified.`
          : "Your maintenance request has been sent to the property manager.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/maintenance-requests"] });
      onOpenChange(false);
      onSuccessNavigate?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit maintenance request",
        variant: "destructive",
      });
    },
  });

  const handleGetAiSuggestions = async () => {
    if (photoUrls.length === 0) return;
    setIsAnalyzing(true);
    try {
      // Send title/description as optional notes only — photo is the primary input on the server.
      const notes = [
        title.trim() ? `Title: ${title.trim()}` : "",
        description.trim() ? `Description: ${description.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await analyzeMutation.mutateAsync({
        imageUrl: photoUrls[0],
        issueDescription: notes,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasTenancy) {
      toast({
        title: "No property linked",
        description: "Your account isn't linked to a property yet. Contact your property manager.",
        variant: "destructive",
      });
      return;
    }
    if (!title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a short title for the issue.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate();
  };

  const removePhoto = (index: number) => {
    setPhotoUrls((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) setAiSuggestions("");
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-log-request">
        <DialogHeader>
          <DialogTitle>Log a Maintenance Request</DialogTitle>
          <DialogDescription>
            Submit a new maintenance request for your property
          </DialogDescription>
        </DialogHeader>

        {hasTenancy && property && (
          <div className="rounded-lg border bg-muted/40 p-3 flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg shrink-0">
              <Home className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs text-muted-foreground">Filing against</p>
              <p className="font-medium truncate" data-testid="text-property-name">
                {property.name}
              </p>
              {property.address && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 truncate">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {property.address}
                </p>
              )}
            </div>
          </div>
        )}

        {!hasTenancy && tenancyData !== undefined && (
          <p className="text-sm text-destructive">
            No active property is linked to your account. Please contact your property manager.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="log-request-title">Title</Label>
            <Input
              id="log-request-title"
              placeholder="e.g. Kitchen tap leaking"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              data-testid="input-request-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="log-request-priority">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="log-request-priority" data-testid="select-request-priority">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="log-request-description">Description</Label>
            <Textarea
              id="log-request-description"
              placeholder="Describe the issue, where it is, and anything else that helps..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              data-testid="input-request-description"
            />
          </div>

          <div className="space-y-2">
            <Label>Photos (optional)</Label>
            <ObjectUploader
              buttonVariant="default"
              buttonClassName="w-full h-10"
              onGetUploadParameters={async () => {
                const response = await fetch("/api/objects/upload", {
                  method: "POST",
                  credentials: "include",
                });
                if (!response.ok) {
                  throw new Error(`Failed to get upload URL: ${response.statusText}`);
                }
                const data = await response.json();
                if (!data.uploadURL) {
                  throw new Error("Invalid upload URL response");
                }
                return { method: "PUT", url: data.uploadURL };
              }}
              onComplete={(result) => {
                try {
                  if (result.successful && result.successful.length > 0) {
                    let uploadURL = result.successful[0].uploadURL || result.successful[0].source;
                    if (!uploadURL) {
                      toast({
                        title: "Upload Error",
                        description: "Upload succeeded but could not get image URL.",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (uploadURL.startsWith("http://") || uploadURL.startsWith("https://")) {
                      try {
                        uploadURL = new URL(uploadURL).pathname;
                      } catch {
                        toast({
                          title: "Upload Error",
                          description: "Invalid file URL format.",
                          variant: "destructive",
                        });
                        return;
                      }
                    }
                    if (!uploadURL.startsWith("/objects/")) {
                      toast({
                        title: "Upload Error",
                        description: "Invalid file URL format.",
                        variant: "destructive",
                      });
                      return;
                    }
                    setAiSuggestions("");
                    setPhotoUrls((prev) => [...prev, `${window.location.origin}${uploadURL}`]);
                    toast({
                      title: "Image uploaded",
                      description: "Photo added to your request.",
                    });
                  } else if (result.failed?.length) {
                    toast({
                      title: "Upload Failed",
                      description: result.failed[0].error?.message || "Failed to upload image.",
                      variant: "destructive",
                    });
                  }
                } catch (error: any) {
                  toast({
                    title: "Upload Error",
                    description: error.message || "An error occurred while processing the upload.",
                    variant: "destructive",
                  });
                }
              }}
              data-testid="button-upload-photo"
            >
              <ImagePlus className="h-4 w-4 mr-2" />
              Upload Photos
            </ObjectUploader>
            {photoUrls.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {photoUrls.map((url, index) => (
                  <div key={`${url}-${index}`} className="relative inline-block">
                    <img
                      src={url}
                      alt={`Upload ${index + 1}`}
                      className="h-20 w-20 object-cover rounded-lg"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={() => removePhoto(index)}
                      data-testid={`button-remove-photo-${index}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {photoUrls.length > 0 && !aiSuggestions && (
            <Button
              type="button"
              variant="outline"
              onClick={handleGetAiSuggestions}
              disabled={isAnalyzing}
              className="w-full"
              data-testid="button-analyze-images"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" /> Get AI Suggestions
                </>
              )}
            </Button>
          )}

          {aiSuggestions && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI-Suggested Fixes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{aiSuggestions}</p>
              </CardContent>
            </Card>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={createMutation.isPending || !title.trim() || !hasTenancy}
            data-testid="button-submit-request"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ClipboardList className="h-4 w-4 mr-2" />
            )}
            Create Request
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
