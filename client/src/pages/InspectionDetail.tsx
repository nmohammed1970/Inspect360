import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, MapPin, User, CheckCircle } from "lucide-react";
import { format } from "date-fns";

export default function InspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: inspection, isLoading } = useQuery<any>({
    queryKey: ["/api/inspections", id],
    enabled: !!id,
  });

  const completeInspection = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/inspections/${id}/status`, "PATCH", {
        status: "completed",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inspections/my"] });
      toast({
        title: "Success",
        description: "Inspection marked as completed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update inspection status",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-center items-center h-64">
          <p className="text-muted-foreground">Loading inspection...</p>
        </div>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-lg font-medium">Inspection not found</p>
            <Link href="/inspections">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Inspections
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      in_progress: { variant: "default", label: "In Progress" },
      completed: { variant: "outline", label: "Completed" },
    };
    const config = variants[status] || variants.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      check_in: "Check In",
      check_out: "Check Out",
      routine: "Routine",
      maintenance: "Maintenance",
    };
    return <Badge variant="outline">{labels[type] || type}</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/inspections">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Inspection Details
          </h1>
          <p className="text-muted-foreground">
            {inspection.property?.name} - Unit {inspection.unit?.unitNumber}
          </p>
        </div>
        {inspection.status !== "completed" && (
          <Button
            onClick={() => completeInspection.mutate()}
            disabled={completeInspection.isPending}
            data-testid="button-complete"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {completeInspection.isPending ? "Completing..." : "Mark Complete"}
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inspection Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status:</span>
              {getStatusBadge(inspection.status)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Type:</span>
              {getTypeBadge(inspection.type)}
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">
                {inspection.scheduledDate
                  ? format(new Date(inspection.scheduledDate), "MMMM dd, yyyy")
                  : "Not scheduled"}
              </span>
            </div>
            {inspection.completedDate && (
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  Completed: {format(new Date(inspection.completedDate), "MMMM dd, yyyy")}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Property & Unit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{inspection.property?.name}</span>
              </div>
              <p className="text-sm text-muted-foreground ml-6">
                {inspection.property?.address}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">Unit:</span>
              <p className="font-medium">{inspection.unit?.unitNumber}</p>
            </div>
            {inspection.clerk && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Assigned Clerk:</span>
                </div>
                <p className="text-sm ml-6">{inspection.clerk.email}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {inspection.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{inspection.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Inspection Items</CardTitle>
          <CardDescription>
            Photos and condition assessments for this inspection
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              Photo upload and AI analysis coming soon
            </p>
            <p className="text-sm text-muted-foreground">
              This section will allow clerks to capture photos, rate conditions,
              and trigger AI analysis for each inspection item
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
