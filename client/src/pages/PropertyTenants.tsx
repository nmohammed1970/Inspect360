import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Users,
  Plus,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  Edit,
  Trash2,
  User,
  History,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AddTenantDialog from "@/components/AddTenantDialog";
import EditTenantDialog from "@/components/EditTenantDialog";

interface TenantAssignment {
  id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  profileImageUrl?: string;
  role: string;
  assignment: {
    id: string;
    leaseStartDate?: Date | string;
    leaseEndDate?: Date | string;
    monthlyRent?: string;
    depositAmount?: string;
    isActive: boolean;
  };
}

interface Property {
  id: string;
  name: string;
  address: string;
  type: string;
}

export default function PropertyTenants() {
  const [, params] = useRoute("/properties/:id/tenants");
  const propertyId = params?.id;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"active" | "historical">("active");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantAssignment | null>(null);

  const { data: property, isLoading: propertyLoading } = useQuery<Property>({
    queryKey: ["/api/properties", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch property");
      return res.json();
    },
    enabled: !!propertyId,
  });

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery<TenantAssignment[]>({
    queryKey: ["/api/properties", propertyId, "tenants"],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/tenants`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tenants");
      return res.json();
    },
    enabled: !!propertyId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return apiRequest(`/api/tenant-assignments/${assignmentId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "tenants"] });
      toast({
        title: "Tenant assignment deleted",
        description: "The tenant has been removed from this property",
      });
      setDeleteDialogOpen(false);
      setSelectedTenant(null);
    },
    onError: () => {
      toast({
        title: "Failed to delete assignment",
        description: "An error occurred while removing the tenant",
        variant: "destructive",
      });
    },
  });

  const activeTenants = tenants.filter((t) => t.assignment.isActive);
  const historicalTenants = tenants.filter((t) => !t.assignment.isActive);

  const handleDelete = (tenant: TenantAssignment) => {
    setSelectedTenant(tenant);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedTenant?.assignment.id) {
      deleteMutation.mutate(selectedTenant.assignment.id);
    }
  };

  if (propertyLoading || tenantsLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">Loading...</div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Property not found</p>
          <Link href="/properties">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Properties
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const TenantCard = ({ tenant, showStatus = false }: { tenant: TenantAssignment; showStatus?: boolean }) => {
    const fullName = [tenant.firstName, tenant.lastName].filter(Boolean).join(" ") || "Unnamed Tenant";
    const initials = fullName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const isActive = tenant.assignment.isActive;
    const leaseStartDate = tenant.assignment.leaseStartDate
      ? new Date(tenant.assignment.leaseStartDate)
      : null;
    const leaseEndDate = tenant.assignment.leaseEndDate ? new Date(tenant.assignment.leaseEndDate) : null;
    const monthlyRent = tenant.assignment.monthlyRent
      ? parseFloat(tenant.assignment.monthlyRent)
      : null;
    const depositAmount = tenant.assignment.depositAmount
      ? parseFloat(tenant.assignment.depositAmount)
      : null;

    return (
      <Card className="hover-elevate" data-testid={`card-tenant-${tenant.id}`}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <Avatar className="h-12 w-12">
                <AvatarImage src={tenant.profileImageUrl} alt={fullName} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base">{fullName}</CardTitle>
                <div className="space-y-1 mt-2">
                  {tenant.email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4 shrink-0" />
                      <span className="truncate">{tenant.email}</span>
                    </div>
                  )}
                  {tenant.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4 shrink-0" />
                      <span>{tenant.phone}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {showStatus && (
              <Badge variant={isActive ? "default" : "secondary"}>
                {isActive ? "Active" : "Inactive"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {(leaseStartDate || leaseEndDate) && (
            <div className="flex items-start gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <div className="text-muted-foreground text-xs">Lease Period</div>
                <div>
                  {leaseStartDate && format(leaseStartDate, "MMM d, yyyy")}
                  {leaseStartDate && leaseEndDate && " - "}
                  {leaseEndDate && format(leaseEndDate, "MMM d, yyyy")}
                </div>
              </div>
            </div>
          )}

          {(monthlyRent !== null || depositAmount !== null) && (
            <div className="flex items-start gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-1">
                {monthlyRent !== null && (
                  <div>
                    <span className="text-muted-foreground text-xs">Monthly Rent: </span>
                    <span className="font-medium">
                      ${monthlyRent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {depositAmount !== null && (
                  <div>
                    <span className="text-muted-foreground text-xs">Deposit: </span>
                    <span className="font-medium">
                      ${depositAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t">
            <EditTenantDialog propertyId={propertyId!} tenant={tenant}>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                data-testid={`button-edit-${tenant.id}`}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </EditTenantDialog>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDelete(tenant)}
              data-testid={`button-delete-${tenant.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/properties">
          <Button variant="ghost" className="mb-4" data-testid="button-back-to-properties">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Properties
          </Button>
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8 text-primary" />
              Tenant Management
            </h1>
            <p className="text-muted-foreground mt-2">
              {property.name} - {property.address}
            </p>
          </div>

          <AddTenantDialog propertyId={propertyId!}>
            <Button data-testid="button-add-tenant">
              <Plus className="h-4 w-4 mr-2" />
              Add Tenant
            </Button>
          </AddTenantDialog>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-active-tenants">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tenants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeTenants.length}</div>
            <p className="text-xs text-muted-foreground">Currently assigned</p>
          </CardContent>
        </Card>

        <Card data-testid="card-historical-tenants">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Historical Records</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{historicalTenants.length}</div>
            <p className="text-xs text-muted-foreground">Past assignments</p>
          </CardContent>
        </Card>

        <Card data-testid="card-monthly-revenue">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              $
              {activeTenants
                .reduce((sum, t) => sum + (t.assignment.monthlyRent ? parseFloat(t.assignment.monthlyRent) : 0), 0)
                .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">From active leases</p>
          </CardContent>
        </Card>
      </div>

      {/* Tenants List with Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "historical")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active" data-testid="tab-active">
            <User className="h-4 w-4 mr-2" />
            Active Tenants ({activeTenants.length})
          </TabsTrigger>
          <TabsTrigger value="historical" data-testid="tab-historical">
            <History className="h-4 w-4 mr-2" />
            Historical ({historicalTenants.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4 mt-6">
          {activeTenants.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No active tenants</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Add a tenant to start tracking their lease and rental information
                </p>
                <AddTenantDialog propertyId={propertyId!}>
                  <Button data-testid="button-add-first-tenant">
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Tenant
                  </Button>
                </AddTenantDialog>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeTenants.map((tenant) => (
                <TenantCard key={tenant.id} tenant={tenant} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historical" className="space-y-4 mt-6">
          {historicalTenants.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No historical records</h3>
                <p className="text-muted-foreground text-center">
                  Past tenant assignments will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {historicalTenants.map((tenant) => (
                <TenantCard key={tenant.id} tenant={tenant} showStatus />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Tenant Assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              {selectedTenant && [selectedTenant.firstName, selectedTenant.lastName].filter(Boolean).join(" ")}{" "}
              from this property. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Remove Tenant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
