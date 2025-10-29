import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Settings, Link as LinkIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Property } from "@shared/schema";

interface FixfloConfig {
  id: string;
  organizationId: string;
  baseUrl: string;
  bearerToken?: string;
  webhookVerifyToken?: string;
  isEnabled: boolean;
  lastHealthCheckAt?: string;
  healthCheckStatus?: string;
  healthCheckErrorMessage?: string;
}

interface FixfloSyncState {
  id: string;
  organizationId: string;
  entityType: string;
  lastSyncAt?: string;
  lastSuccessfulSyncAt?: string;
  syncStatus: string;
  errorMessage?: string;
  recordsSynced: number;
  recordsFailed: number;
}

export default function FixfloIntegrationSettings() {
  const { toast } = useToast();
  const [baseUrl, setBaseUrl] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [fixfloPropertyId, setFixfloPropertyId] = useState("");
  const [isPropertyDialogOpen, setIsPropertyDialogOpen] = useState(false);

  // Fetch Fixflo configuration
  const { data: config, isLoading: configLoading } = useQuery<FixfloConfig>({
    queryKey: ["/api/fixflo/config"],
  });

  // Fetch sync state
  const { data: syncStates = [], isLoading: syncLoading } = useQuery<FixfloSyncState[]>({
    queryKey: ["/api/fixflo/sync-state"],
  });

  // Fetch properties for mapping
  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  // Initialize form when config loads
  useEffect(() => {
    if (config) {
      setBaseUrl(config.baseUrl || "");
      setIsEnabled(config.isEnabled);
    }
  }, [config]);

  // Save configuration mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/fixflo/config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fixflo/config"] });
      toast({
        title: "Configuration Saved",
        description: "Fixflo integration settings have been updated",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save configuration",
      });
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const testData: any = {
        baseUrl: baseUrl || config?.baseUrl,
      };
      // Only include bearerToken if user has entered a new value
      if (bearerToken.trim()) {
        testData.bearerToken = bearerToken.trim();
      }
      return await apiRequest("POST", "/api/fixflo/health-check", testData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fixflo/config"] });
      toast({
        title: "Connection Successful",
        description: "Successfully connected to Fixflo API",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Connection Failed",
        description: error.message || "Failed to connect to Fixflo API",
      });
    },
  });

  // Update property mapping mutation
  const updatePropertyMutation = useMutation({
    mutationFn: async ({ propertyId, fixfloPropertyId }: { propertyId: string; fixfloPropertyId: string }) => {
      return await apiRequest("PATCH", `/api/properties/${propertyId}`, { fixfloPropertyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({
        title: "Property Mapping Updated",
        description: "Property has been linked to Fixflo",
      });
      setIsPropertyDialogOpen(false);
      setSelectedProperty(null);
      setFixfloPropertyId("");
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update property mapping",
      });
    },
  });

  const handleSaveConfig = () => {
    const configData: any = {
      baseUrl: baseUrl.trim(),
      isEnabled,
    };

    if (bearerToken.trim()) {
      configData.bearerToken = bearerToken.trim();
    }
    if (webhookVerifyToken.trim()) {
      configData.webhookVerifyToken = webhookVerifyToken.trim();
    }

    saveConfigMutation.mutate(configData);
  };

  const handleTestConnection = () => {
    if (!baseUrl && !config?.baseUrl) {
      toast({
        variant: "destructive",
        title: "Base URL Required",
        description: "Please enter a Fixflo API base URL",
      });
      return;
    }
    testConnectionMutation.mutate();
  };

  const handleOpenPropertyDialog = (property: Property) => {
    setSelectedProperty(property);
    setFixfloPropertyId(property.fixfloPropertyId || "");
    setIsPropertyDialogOpen(true);
  };

  const handleSavePropertyMapping = () => {
    if (!selectedProperty) return;
    updatePropertyMutation.mutate({
      propertyId: selectedProperty.id,
      fixfloPropertyId: fixfloPropertyId.trim(),
    });
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "success":
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Healthy</Badge>;
      case "error":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" />Unknown</Badge>;
    }
  };

  const getSyncStatusBadge = (status: string) => {
    switch (status) {
      case "syncing":
        return <Badge variant="secondary"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Syncing</Badge>;
      case "error":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Error</Badge>;
      case "idle":
      default:
        return <Badge variant="outline">Idle</Badge>;
    }
  };

  if (configLoading || syncLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="configuration" className="w-full">
        <TabsList>
          <TabsTrigger value="configuration" data-testid="tab-fixflo-configuration">
            <Settings className="w-4 h-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="property-mapping" data-testid="tab-fixflo-property-mapping">
            <LinkIcon className="w-4 h-4 mr-2" />
            Property Mapping
          </TabsTrigger>
          <TabsTrigger value="sync-status" data-testid="tab-fixflo-sync-status">
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync Status
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configuration">
          <Card>
            <CardHeader>
              <CardTitle>Fixflo API Configuration</CardTitle>
              <CardDescription>
                Configure your Fixflo integration settings to sync maintenance requests with Fixflo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="baseUrl">Fixflo API Base URL</Label>
                <Input
                  id="baseUrl"
                  placeholder="https://api.fixflo.com"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  data-testid="input-fixflo-base-url"
                />
                <p className="text-sm text-muted-foreground">
                  The base URL for your Fixflo API instance
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bearerToken">Bearer Token</Label>
                <Input
                  id="bearerToken"
                  type="password"
                  placeholder="Enter bearer token (optional to update)"
                  value={bearerToken}
                  onChange={(e) => setBearerToken(e.target.value)}
                  data-testid="input-fixflo-bearer-token"
                />
                <p className="text-sm text-muted-foreground">
                  Your Fixflo API bearer token for authentication
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhookToken">Webhook Verify Token</Label>
                <Input
                  id="webhookToken"
                  type="password"
                  placeholder="Enter webhook token (optional to update)"
                  value={webhookVerifyToken}
                  onChange={(e) => setWebhookVerifyToken(e.target.value)}
                  data-testid="input-fixflo-webhook-token"
                />
                <p className="text-sm text-muted-foreground">
                  Token for verifying incoming webhooks from Fixflo
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isEnabled"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="w-4 h-4"
                  data-testid="checkbox-fixflo-enabled"
                />
                <Label htmlFor="isEnabled" className="cursor-pointer">
                  Enable Fixflo Integration
                </Label>
              </div>

              {config?.lastHealthCheckAt && (
                <div className="flex items-center justify-between p-4 border rounded-md bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">Last Health Check</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(config.lastHealthCheckAt).toLocaleString()}
                    </p>
                  </div>
                  {getStatusBadge(config.healthCheckStatus)}
                </div>
              )}

              {config?.healthCheckErrorMessage && (
                <div className="p-4 border border-destructive/50 rounded-md bg-destructive/10">
                  <p className="text-sm font-medium text-destructive">Error Message</p>
                  <p className="text-xs text-muted-foreground mt-1">{config.healthCheckErrorMessage}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleSaveConfig}
                  disabled={saveConfigMutation.isPending}
                  data-testid="button-save-fixflo-config"
                >
                  {saveConfigMutation.isPending ? "Saving..." : "Save Configuration"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testConnectionMutation.isPending}
                  data-testid="button-test-fixflo-connection"
                >
                  {testConnectionMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    "Test Connection"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="property-mapping">
          <Card>
            <CardHeader>
              <CardTitle>Property Mapping</CardTitle>
              <CardDescription>
                Link your Inspect360 properties to Fixflo property IDs for automatic sync
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Fixflo Property ID</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {properties.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No properties found
                      </TableCell>
                    </TableRow>
                  ) : (
                    properties.map((property) => (
                      <TableRow key={property.id}>
                        <TableCell className="font-medium" data-testid={`text-property-${property.id}`}>
                          {property.name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {property.address || "N/A"}
                        </TableCell>
                        <TableCell>
                          {property.fixfloPropertyId ? (
                            <Badge variant="outline" data-testid={`badge-fixflo-id-${property.id}`}>
                              {property.fixfloPropertyId}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Not mapped</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenPropertyDialog(property)}
                            data-testid={`button-map-property-${property.id}`}
                          >
                            <LinkIcon className="w-4 h-4 mr-2" />
                            {property.fixfloPropertyId ? "Update" : "Map"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync-status">
          <Card>
            <CardHeader>
              <CardTitle>Sync Status</CardTitle>
              <CardDescription>
                Monitor the status of data synchronization with Fixflo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Sync</TableHead>
                    <TableHead>Records Synced</TableHead>
                    <TableHead>Records Failed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncStates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No sync activity yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    syncStates.map((state) => (
                      <TableRow key={state.id}>
                        <TableCell className="font-medium capitalize">
                          {state.entityType}
                        </TableCell>
                        <TableCell>{getSyncStatusBadge(state.syncStatus)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {state.lastSyncAt
                            ? new Date(state.lastSyncAt).toLocaleString()
                            : "Never"}
                        </TableCell>
                        <TableCell>{state.recordsSynced}</TableCell>
                        <TableCell>
                          {state.recordsFailed > 0 ? (
                            <span className="text-destructive font-medium">
                              {state.recordsFailed}
                            </span>
                          ) : (
                            state.recordsFailed
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              
              {syncStates.some((state) => state.errorMessage) && (
                <div className="mt-4 space-y-2">
                  <h4 className="font-medium text-sm">Recent Errors</h4>
                  {syncStates
                    .filter((state) => state.errorMessage)
                    .map((state) => (
                      <div
                        key={state.id}
                        className="p-3 border border-destructive/50 rounded-md bg-destructive/10"
                      >
                        <p className="text-sm font-medium text-destructive capitalize">
                          {state.entityType}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {state.errorMessage}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isPropertyDialogOpen} onOpenChange={setIsPropertyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Map Property to Fixflo</DialogTitle>
            <DialogDescription>
              Enter the Fixflo property ID for {selectedProperty?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fixfloPropertyId">Fixflo Property ID</Label>
              <Input
                id="fixfloPropertyId"
                placeholder="Enter Fixflo property ID"
                value={fixfloPropertyId}
                onChange={(e) => setFixfloPropertyId(e.target.value)}
                data-testid="input-fixflo-property-id"
              />
              <p className="text-sm text-muted-foreground">
                This ID is used to link maintenance requests to the correct property in Fixflo
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsPropertyDialogOpen(false)}
              data-testid="button-cancel-property-mapping"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSavePropertyMapping}
              disabled={updatePropertyMutation.isPending || !fixfloPropertyId.trim()}
              data-testid="button-save-property-mapping"
            >
              {updatePropertyMutation.isPending ? "Saving..." : "Save Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
