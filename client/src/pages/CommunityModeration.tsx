import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Users, MessageSquare, Check, X, Flag, Clock, Eye, Shield, 
  AlertTriangle, CheckCircle, FileText, Settings
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { format } from "date-fns";
import { Link } from "wouter";

interface CommunityGroup {
  id: string;
  name: string;
  description: string | null;
  blockId: string;
  blockName: string;
  createdBy: string;
  creatorName: string;
  memberCount: number;
  postCount: number;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

interface CommunityFlag {
  id: string;
  threadId: string | null;
  postId: string | null;
  reason: string;
  details: string | null;
  isResolved: boolean;
  reporterName: string;
  createdAt: string;
  content: { type: string; title?: string; content: string };
}

interface ModerationLog {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  moderatorName: string;
  createdAt: string;
}

interface CommunityRules {
  id: string;
  rulesText: string;
  version: number;
  isActive: boolean;
  createdAt: string;
}

export default function CommunityModeration() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("groups");
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);
  const [selectedFlag, setSelectedFlag] = useState<CommunityFlag | null>(null);
  const [showRulesEditor, setShowRulesEditor] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [rulesText, setRulesText] = useState("");

  const { data: pendingCount = { count: 0 } } = useQuery<{ count: number }>({
    queryKey: ["/api/community/pending-count"],
  });

  const { data: groups = [], isLoading: groupsLoading } = useQuery<CommunityGroup[]>({
    queryKey: ["/api/community/groups"],
  });

  const { data: flags = [], isLoading: flagsLoading } = useQuery<CommunityFlag[]>({
    queryKey: ["/api/community/flags"],
  });

  const { data: moderationLog = [], isLoading: logLoading } = useQuery<ModerationLog[]>({
    queryKey: ["/api/community/moderation-log"],
  });

  const { data: currentRules } = useQuery<CommunityRules | null>({
    queryKey: ["/api/community/rules"],
  });

  const approveGroupMutation = useMutation({
    mutationFn: (groupId: string) => 
      apiRequest("PATCH", `/api/community/groups/${groupId}`, { status: "approved" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/community/pending-count"] });
      toast({ title: "Group approved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve group", variant: "destructive" });
    },
  });

  const rejectGroupMutation = useMutation({
    mutationFn: (data: { groupId: string; reason: string }) => 
      apiRequest("PATCH", `/api/community/groups/${data.groupId}`, { 
        status: "rejected", 
        rejectionReason: data.reason 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/community/pending-count"] });
      setSelectedGroup(null);
      setRejectionReason("");
      toast({ title: "Group rejected" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject group", variant: "destructive" });
    },
  });

  const resolveFlagMutation = useMutation({
    mutationFn: (data: { flagId: string; action: string; notes: string }) => 
      apiRequest("POST", `/api/community/flags/${data.flagId}/resolve`, { 
        action: data.action, 
        notes: data.notes 
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/flags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/community/moderation-log"] });
      setSelectedFlag(null);
      setResolutionNotes("");
      toast({ title: "Flag resolved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to resolve flag", variant: "destructive" });
    },
  });

  const saveRulesMutation = useMutation({
    mutationFn: (rulesText: string) => 
      apiRequest("POST", "/api/community/rules", { rulesText }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/rules"] });
      setShowRulesEditor(false);
      toast({ title: "Community rules updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save rules", variant: "destructive" });
    },
  });

  const pendingGroups = groups.filter(g => g.status === "pending");
  const approvedGroups = groups.filter(g => g.status === "approved");
  const rejectedGroups = groups.filter(g => g.status === "rejected");
  const unresolvedFlags = flags.filter(f => !f.isResolved);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive"><X className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "approved":
        return <Badge variant="default">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "hidden":
        return <Badge variant="secondary">Hidden</Badge>;
      case "removed":
        return <Badge variant="destructive">Removed</Badge>;
      case "restored":
        return <Badge variant="outline">Restored</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Community Moderation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Shield className="h-6 w-6 text-primary" />
            Community Moderation
          </h1>
          <p className="text-muted-foreground">Manage community groups and moderate content</p>
        </div>
        <Button onClick={() => {
          setRulesText(currentRules?.rulesText || "");
          setShowRulesEditor(true);
        }} data-testid="button-edit-rules">
          <Settings className="h-4 w-4 mr-2" />
          Edit Community Rules
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Groups</CardDescription>
            <CardTitle className="text-3xl" data-testid="text-pending-count">{pendingCount.count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Groups</CardDescription>
            <CardTitle className="text-3xl" data-testid="text-approved-count">{approvedGroups.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open Flags</CardDescription>
            <CardTitle className="text-3xl" data-testid="text-flags-count">{unresolvedFlags.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rules Version</CardDescription>
            <CardTitle className="text-3xl" data-testid="text-rules-version">{currentRules?.version || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="groups" data-testid="tab-groups">
            <Users className="h-4 w-4 mr-2" />
            Groups
            {pendingCount.count > 0 && (
              <Badge variant="destructive" className="ml-2">{pendingCount.count}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="flags" data-testid="tab-flags">
            <Flag className="h-4 w-4 mr-2" />
            Flagged Content
            {unresolvedFlags.length > 0 && (
              <Badge variant="destructive" className="ml-2">{unresolvedFlags.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="log" data-testid="tab-log">
            <FileText className="h-4 w-4 mr-2" />
            Moderation Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="groups" className="mt-6">
          {groupsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : groups.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No community groups have been created yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingGroups.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-amber-500" />
                    Pending Approval ({pendingGroups.length})
                  </h3>
                  <div className="space-y-3">
                    {pendingGroups.map((group) => (
                      <Card key={group.id} className="border-amber-200 dark:border-amber-800" data-testid={`card-pending-group-${group.id}`}>
                        <CardHeader>
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                              <CardTitle className="text-base" data-testid={`text-group-name-${group.id}`}>
                                {group.name}
                              </CardTitle>
                              <CardDescription>
                                {group.blockName} | Created by {group.creatorName} | {format(new Date(group.createdAt), "PP")}
                              </CardDescription>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => approveGroupMutation.mutate(group.id)}
                                disabled={approveGroupMutation.isPending}
                                data-testid={`button-approve-${group.id}`}
                              >
                                <Check className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setSelectedGroup(group)}
                                data-testid={`button-reject-${group.id}`}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        {group.description && (
                          <CardContent className="pt-0">
                            <p className="text-sm text-muted-foreground">{group.description}</p>
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {approvedGroups.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Active Groups ({approvedGroups.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {approvedGroups.map((group) => (
                      <Card key={group.id} data-testid={`card-approved-group-${group.id}`}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{group.name}</CardTitle>
                          <CardDescription>{group.blockName}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {group.memberCount}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {group.postCount}
                          </span>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {rejectedGroups.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <X className="h-5 w-5 text-destructive" />
                    Rejected Groups ({rejectedGroups.length})
                  </h3>
                  <div className="space-y-2">
                    {rejectedGroups.map((group) => (
                      <Card key={group.id} className="opacity-75" data-testid={`card-rejected-group-${group.id}`}>
                        <CardHeader className="py-3">
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <CardTitle className="text-base">{group.name}</CardTitle>
                              <CardDescription>
                                {group.blockName} | Reason: {group.rejectionReason || "Not specified"}
                              </CardDescription>
                            </div>
                            {getStatusBadge(group.status)}
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="flags" className="mt-6">
          {flagsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : flags.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <Flag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No flagged content to review.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {unresolvedFlags.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Needs Review ({unresolvedFlags.length})
                  </h3>
                  <div className="space-y-3">
                    {unresolvedFlags.map((flag) => (
                      <Card key={flag.id} className="border-amber-200 dark:border-amber-800" data-testid={`card-flag-${flag.id}`}>
                        <CardHeader>
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                              <CardTitle className="text-base flex items-center gap-2">
                                <Badge variant="outline">{flag.content?.type}</Badge>
                                {flag.content?.title || "Reply"}
                              </CardTitle>
                              <CardDescription>
                                Reported by {flag.reporterName} | {format(new Date(flag.createdAt), "PPp")}
                              </CardDescription>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => setSelectedFlag(flag)}
                              data-testid={`button-review-flag-${flag.id}`}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Review
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="text-sm mb-2">
                            <span className="font-medium">Reason:</span> {flag.reason}
                          </div>
                          {flag.details && (
                            <div className="text-sm text-muted-foreground">
                              <span className="font-medium">Details:</span> {flag.details}
                            </div>
                          )}
                          <Separator className="my-3" />
                          <div className="text-sm p-3 bg-muted/50 rounded-md">
                            <p className="line-clamp-3">{flag.content?.content}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {flags.filter(f => f.isResolved).length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Resolved ({flags.filter(f => f.isResolved).length})
                  </h3>
                  <div className="space-y-2">
                    {flags.filter(f => f.isResolved).map((flag) => (
                      <Card key={flag.id} className="opacity-75">
                        <CardHeader className="py-3">
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <CardTitle className="text-base">{flag.content?.title || flag.content?.type}</CardTitle>
                              <CardDescription>
                                {flag.reason} | Resolved {format(new Date(flag.createdAt), "PP")}
                              </CardDescription>
                            </div>
                            <Badge variant="secondary">Resolved</Badge>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="log" className="mt-6">
          {logLoading ? (
            <Skeleton className="h-48" />
          ) : moderationLog.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No moderation actions recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {moderationLog.map((log) => (
                    <div key={log.id} className="flex items-start gap-4 pb-4 border-b last:border-0" data-testid={`log-entry-${log.id}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getActionBadge(log.action)}
                          <span className="font-medium">{log.targetType}</span>
                          <span className="text-muted-foreground text-sm">by {log.moderatorName}</span>
                        </div>
                        {log.reason && (
                          <p className="text-sm text-muted-foreground mt-1">Reason: {log.reason}</p>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground shrink-0">
                        {format(new Date(log.createdAt), "PPp")}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedGroup} onOpenChange={(open) => !open && setSelectedGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Group</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting "{selectedGroup?.name}". The creator will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
              data-testid="input-rejection-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedGroup(null)} data-testid="button-cancel-reject">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedGroup) {
                  rejectGroupMutation.mutate({ groupId: selectedGroup.id, reason: rejectionReason });
                }
              }}
              disabled={!rejectionReason.trim() || rejectGroupMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectGroupMutation.isPending ? "Rejecting..." : "Reject Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedFlag} onOpenChange={(open) => !open && setSelectedFlag(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-destructive" />
              Review Flagged Content
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <h4 className="font-medium mb-2">Reported Content:</h4>
              <div className="p-3 bg-muted/50 rounded-md text-sm">
                {selectedFlag?.content?.title && (
                  <p className="font-medium mb-2">{selectedFlag.content.title}</p>
                )}
                <p className="whitespace-pre-wrap">{selectedFlag?.content?.content}</p>
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-1">Report Reason:</h4>
              <p className="text-sm">{selectedFlag?.reason}</p>
              {selectedFlag?.details && (
                <p className="text-sm text-muted-foreground mt-1">{selectedFlag.details}</p>
              )}
            </div>
            <div>
              <label className="font-medium">Resolution Notes (optional)</label>
              <Textarea
                placeholder="Notes about your decision..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
                data-testid="input-resolution-notes"
              />
            </div>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setSelectedFlag(null)} data-testid="button-cancel-flag-review">
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (selectedFlag) {
                  resolveFlagMutation.mutate({ flagId: selectedFlag.id, action: "dismiss", notes: resolutionNotes });
                }
              }}
              disabled={resolveFlagMutation.isPending}
              data-testid="button-dismiss-flag"
            >
              Dismiss
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (selectedFlag) {
                  resolveFlagMutation.mutate({ flagId: selectedFlag.id, action: "hide", notes: resolutionNotes });
                }
              }}
              disabled={resolveFlagMutation.isPending}
              data-testid="button-hide-content"
            >
              Hide Content
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedFlag) {
                  resolveFlagMutation.mutate({ flagId: selectedFlag.id, action: "remove", notes: resolutionNotes });
                }
              }}
              disabled={resolveFlagMutation.isPending}
              data-testid="button-remove-content"
            >
              Remove Content
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRulesEditor} onOpenChange={setShowRulesEditor}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Community Guidelines</DialogTitle>
            <DialogDescription>
              Edit the community guidelines that tenants must accept before participating.
              {currentRules && ` Current version: ${currentRules.version}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter community guidelines..."
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              rows={15}
              className="font-mono text-sm"
              data-testid="input-rules-text"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRulesEditor(false)} data-testid="button-cancel-rules">
              Cancel
            </Button>
            <Button
              onClick={() => saveRulesMutation.mutate(rulesText)}
              disabled={!rulesText.trim() || saveRulesMutation.isPending}
              data-testid="button-save-rules"
            >
              {saveRulesMutation.isPending ? "Saving..." : "Save & Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
