import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TagFilter } from "@/components/TagFilter";
import type { Tag } from "@shared/schema";
import { ArrowLeft, Users, Home, DollarSign, Percent, Mail, Phone, Building2, Calendar, MessageSquare, Search, Tag as TagIcon } from "lucide-react";
import { format } from "date-fns";
import { BroadcastDialog } from "@/components/BroadcastDialog";
import { useLocale } from "@/contexts/LocaleContext";

interface TenantAssignment {
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
    profileImageUrl?: string;
  };
  property: {
    id: string;
    name: string;
    address: string;
  };
  assignment: {
    id: string;
    leaseStartDate?: Date | string;
    leaseEndDate?: Date | string;
    monthlyRent?: string;
    depositAmount?: string;
    isActive: boolean;
  };
  tags?: Tag[];
}

interface BlockTenantsData {
  stats: {
    totalUnits: number;
    occupiedUnits: number;
    occupancyRate: number;
    totalMonthlyRent: number;
  };
  tenants: TenantAssignment[];
}

interface Block {
  id: string;
  name: string;
  address: string;
}

export default function BlockTenants() {
  const [, params] = useRoute("/blocks/:id/tenants");
  const blockId = params?.id;
  const locale = useLocale();
  const [broadcastDialogOpen, setBroadcastDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTags, setFilterTags] = useState<Tag[]>([]);

  const { data: block, isLoading: blockLoading } = useQuery<Block>({
    queryKey: ["/api/blocks", blockId],
    queryFn: async () => {
      const res = await fetch(`/api/blocks/${blockId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch block");
      return res.json();
    },
    enabled: !!blockId,
  });

  const { data: tenantsData, isLoading: tenantsLoading } = useQuery<BlockTenantsData>({
    queryKey: ["/api/blocks", blockId, "tenants"],
    queryFn: async () => {
      const res = await fetch(`/api/blocks/${blockId}/tenants`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tenants");
      return res.json();
    },
    enabled: !!blockId,
  });

  // Fetch tags for all tenant assignments
  const tenantAssignmentIds = useMemo(() => 
    (tenantsData?.tenants || []).map((t: TenantAssignment) => t.assignment.id).sort().join(','), 
    [tenantsData]
  );
  const { data: tenantTagsMap = {} } = useQuery<Record<string, Tag[]>>({
    queryKey: ["/api/tenant-assignments/tags", blockId, tenantAssignmentIds],
    enabled: !!tenantsData?.tenants && tenantsData.tenants.length > 0,
    queryFn: async () => {
      const tenants = tenantsData?.tenants || [];
      const tagPromises = tenants.map(async (tenant: TenantAssignment) => {
        try {
          const res = await fetch(`/api/tenant-assignments/${tenant.assignment.id}/tags`, { credentials: "include" });
          if (res.ok) {
            const tags = await res.json();
            return { assignmentId: tenant.assignment.id, tags };
          }
        } catch (error) {
          console.error(`Error fetching tags for assignment ${tenant.assignment.id}:`, error);
        }
        return { assignmentId: tenant.assignment.id, tags: [] };
      });
      
      const results = await Promise.all(tagPromises);
      return results.reduce((acc, { assignmentId, tags }) => {
        acc[assignmentId] = tags;
        return acc;
      }, {} as Record<string, Tag[]>);
    },
  });

  // Merge tags into tenants
  const tenantsWithTags = useMemo(() => {
    const tenants = tenantsData?.tenants || [];
    return tenants.map(tenant => ({
      ...tenant,
      tags: tenantTagsMap[tenant.assignment.id] || [],
    }));
  }, [tenantsData, tenantTagsMap]);

  // Filter tenants by search query and tags
  const filteredTenants = useMemo(() => {
    let filtered = tenantsWithTags;

    // Filter by search query (name, email, property name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tenant => {
        const fullName = [tenant.user.firstName, tenant.user.lastName].filter(Boolean).join(' ').toLowerCase();
        return (
          fullName.includes(query) ||
          tenant.user.email.toLowerCase().includes(query) ||
          tenant.property.name.toLowerCase().includes(query)
        );
      });
    }

    // Filter by tags (show tenants that have ALL selected tags)
    if (filterTags.length > 0) {
      filtered = filtered.filter(tenant => {
        if (!tenant.tags || tenant.tags.length === 0) return false;
        return filterTags.every(filterTag =>
          tenant.tags!.some((tenantTag: Tag) => tenantTag.id === filterTag.id)
        );
      });
    }

    return filtered;
  }, [tenantsWithTags, searchQuery, filterTags]);

  if (blockLoading || tenantsLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">Loading...</div>
      </div>
    );
  }

  if (!block) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Block not found</p>
          <Link href="/blocks">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Blocks
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const stats = tenantsData?.stats || { totalUnits: 0, occupiedUnits: 0, occupancyRate: 0, totalMonthlyRent: 0 };
  const tenants = tenantsData?.tenants || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href={`/blocks/${block.id}`}>
          <Button variant="ghost" className="mb-4" data-testid="button-back-to-block">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to {block.name}
          </Button>
        </Link>
        
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8 text-primary" />
              {block.name} - Tenants
            </h1>
            <p className="text-muted-foreground mt-2">
              Tenant occupancy and property assignments for {block.name}
            </p>
          </div>
          
          <Button
            onClick={() => setBroadcastDialogOpen(true)}
            disabled={stats.occupiedUnits === 0}
            data-testid="button-broadcast-message"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Broadcast Message
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-total-units">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Units</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUnits}</div>
            <p className="text-xs text-muted-foreground">
              Properties in this block
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-occupied-units">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupied Units</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.occupiedUnits}</div>
            <p className="text-xs text-muted-foreground">
              Active tenant assignments
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-occupancy-rate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupancy Rate</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.occupancyRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.occupiedUnits} of {stats.totalUnits} units
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-rent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Monthly Rent</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {locale.formatCurrency(stats.totalMonthlyRent, false)}
            </div>
            <p className="text-xs text-muted-foreground">
              Combined monthly revenue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tenants List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Tenants</h2>
        </div>

        {/* Search and Tag Filter */}
        {tenants.length > 0 && (
          <div className="space-y-4 mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by name, email, or property..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-tenants"
              />
            </div>
            <TagFilter
              selectedTags={filterTags}
              onTagsChange={setFilterTags}
              placeholder="Filter by tags..."
            />
          </div>
        )}
        
        {tenants.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No tenants assigned</h3>
              <p className="text-muted-foreground text-center">
                Tenants assigned to properties in this block will appear here
              </p>
            </CardContent>
          </Card>
        ) : filteredTenants.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No tenants found</h3>
              <p className="text-muted-foreground text-center">
                Try adjusting your search or filter criteria
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => {
                  setSearchQuery("");
                  setFilterTags([]);
                }}
              >
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredTenants.map((tenant, index) => {
              const fullName = [tenant.user.firstName, tenant.user.lastName].filter(Boolean).join(' ') || 'Unnamed Tenant';
              const initials = fullName
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);

              return (
                <Card key={index} data-testid={`card-tenant-${index}`} className="hover-elevate">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Tenant Info */}
                      <div className="flex items-start gap-4 flex-1">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={tenant.user.profileImageUrl} alt={fullName} />
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold">{fullName}</h3>
                          <div className="space-y-1 mt-2">
                            {tenant.user.email && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail className="h-4 w-4 shrink-0" />
                                <span className="truncate">{tenant.user.email}</span>
                              </div>
                            )}
                            {tenant.user.phone && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="h-4 w-4 shrink-0" />
                                <span>{tenant.user.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <Badge variant={tenant.assignment.isActive ? "default" : "secondary"}>
                          {tenant.assignment.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>

                      {/* Property Info */}
                      <div className="border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-6 flex-1">
                        <Link href={`/properties/${tenant.property.id}`}>
                          <div className="flex items-start gap-3 hover-elevate p-2 -m-2 rounded-md cursor-pointer">
                            <Building2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-primary">{tenant.property.name}</h4>
                              <p className="text-sm text-muted-foreground truncate">{tenant.property.address}</p>
                            </div>
                          </div>
                        </Link>

                        <div className="mt-3 space-y-2">
                          {tenant.assignment.leaseStartDate && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4 shrink-0" />
                              <span>
                                Lease: {format(new Date(tenant.assignment.leaseStartDate), 'MMM d, yyyy')}
                                {tenant.assignment.leaseEndDate && (
                                  <> - {format(new Date(tenant.assignment.leaseEndDate), 'MMM d, yyyy')}</>
                                )}
                              </span>
                            </div>
                          )}
                          {tenant.assignment.monthlyRent && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <DollarSign className="h-4 w-4 shrink-0" />
                              <span>Rent: {locale.formatCurrency(parseFloat(tenant.assignment.monthlyRent), false)}/month</span>
                            </div>
                          )}
                        </div>

                        {/* Tags */}
                        {tenant.tags && tenant.tags.length > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <div className="flex flex-wrap gap-1.5">
                              {tenant.tags.map((tag: Tag) => (
                                <span
                                  key={tag.id}
                                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md"
                                  style={{ backgroundColor: tag.color || '#e2e8f0' }}
                                  data-testid={`tag-${tenant.assignment.id}-${tag.id}`}
                                >
                                  <TagIcon className="h-3 w-3" />
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <BroadcastDialog
        blockId={blockId!}
        blockName={block.name}
        blockAddress={block.address}
        tenantCount={stats.occupiedUnits}
        open={broadcastDialogOpen}
        onOpenChange={setBroadcastDialogOpen}
      />
    </div>
  );
}
