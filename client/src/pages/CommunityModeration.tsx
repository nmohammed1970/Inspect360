import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Users, MessageSquare, Check, X, Flag, Clock, Eye, Shield, 
  AlertTriangle, CheckCircle, FileText, Settings, Plus, ArrowLeft, Send, Ban, UserX
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

interface Block {
  id: string;
  name: string;
}

interface CommunityGroup {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
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

interface CommunityThread {
  id: string;
  groupId: string;
  title: string;
  content: string;
  createdBy: string;
  authorName: string;
  isOperator: boolean;
  status: string;
  isPinned: boolean;
  isLocked: boolean;
  viewCount: number;
  replyCount: number;
  lastActivityAt: string;
  createdAt: string;
}

interface CommunityPost {
  id: string;
  threadId: string;
  content: string;
  createdBy: string;
  authorName: string;
  isOperator: boolean;
  status: string;
  createdAt: string;
}

interface ThreadWithPosts extends CommunityThread {
  posts: CommunityPost[];
  group: CommunityGroup;
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

interface BlockedTenant {
  id: string;
  organizationId: string;
  tenantUserId: string;
  tenantName: string;
  tenantEmail: string;
  blockedByUserId: string;
  blockedByName: string;
  reason: string | null;
}

interface ActiveTenant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  name: string;
}

type ViewMode = 'list' | 'group' | 'thread';

export default function CommunityModeration() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("groups");
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedGroupForReject, setSelectedGroupForReject] = useState<CommunityGroup | null>(null);
  const [selectedFlag, setSelectedFlag] = useState<CommunityFlag | null>(null);
  const [showRulesEditor, setShowRulesEditor] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateThread, setShowCreateThread] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupBlockId, setNewGroupBlockId] = useState("");
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [newThreadContent, setNewThreadContent] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [showBlockTenantDialog, setShowBlockTenantDialog] = useState(false);
  const [blockTenantUserId, setBlockTenantUserId] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const { data: pendingCount = { count: 0 } } = useQuery<{ count: number }>({
    queryKey: ["/api/community/pending-count"],
  });

  const { data: groups = [], isLoading: groupsLoading } = useQuery<CommunityGroup[]>({
    queryKey: ["/api/community/groups"],
  });

  const { data: blocks = [] } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
  });

  const { data: threads = [], isLoading: threadsLoading } = useQuery<CommunityThread[]>({
    queryKey: ["/api/community/groups", selectedGroupId, "threads"],
    enabled: !!selectedGroupId && viewMode === 'group',
  });

  const { data: threadData, isLoading: threadLoading } = useQuery<ThreadWithPosts>({
    queryKey: ["/api/community/threads", selectedThreadId],
    enabled: !!selectedThreadId && viewMode === 'thread',
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

  const { data: blockedTenants = [], isLoading: blockedLoading } = useQuery<BlockedTenant[]>({
    queryKey: ["/api/community/blocked-tenants"],
  });

  // Fetch active tenants for the block tenant dropdown
  const { data: activeTenants = [] } = useQuery<ActiveTenant[]>({
    queryKey: ["/api/tenants/active"],
  });

  const blockTenantMutation = useMutation({
    mutationFn: (data: { tenantUserId: string; reason?: string }) => 
      apiRequest("POST", "/api/community/blocked-tenants", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/blocked-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/community/moderation-log"] });
      setShowBlockTenantDialog(false);
      setBlockTenantUserId("");
      setBlockReason("");
      toast({ title: "Tenant blocked from community" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to block tenant", variant: "destructive" });
    },
  });

  const unblockTenantMutation = useMutation({
    mutationFn: (tenantUserId: string) => 
      apiRequest("DELETE", `/api/community/blocked-tenants/${tenantUserId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/blocked-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/community/moderation-log"] });
      toast({ title: "Tenant unblocked" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to unblock tenant", variant: "destructive" });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: (data: { name: string; description: string; blockId: string }) => 
      apiRequest("POST", "/api/community/groups", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/groups"] });
      setShowCreateGroup(false);
      setNewGroupName("");
      setNewGroupDescription("");
      setNewGroupBlockId("");
      toast({ title: "Group created successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create group", variant: "destructive" });
    },
  });

  const createThreadMutation = useMutation({
    mutationFn: (data: { title: string; content: string }) => 
      apiRequest("POST", `/api/community/groups/${selectedGroupId}/threads`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/groups", selectedGroupId, "threads"] });
      setShowCreateThread(false);
      setNewThreadTitle("");
      setNewThreadContent("");
      toast({ title: "Thread created" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create thread", variant: "destructive" });
    },
  });

  const createPostMutation = useMutation({
    mutationFn: (content: string) => 
      apiRequest("POST", `/api/community/threads/${selectedThreadId}/posts`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/threads", selectedThreadId] });
      setReplyContent("");
      toast({ title: "Reply posted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to post reply", variant: "destructive" });
    },
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
      setSelectedGroupForReject(null);
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

  const currentGroup = groups.find(g => g.id === selectedGroupId);

  const handleViewGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setViewMode('group');
  };

  const handleViewThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    setViewMode('thread');
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedGroupId(null);
    setSelectedThreadId(null);
  };

  const handleBackToGroup = () => {
    setViewMode('group');
    setSelectedThreadId(null);
  };

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

  // Thread view - loading state
  if (viewMode === 'thread' && threadLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink className="cursor-pointer" onClick={handleBackToList}>Community</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Skeleton className="h-4 w-24" />
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBackToGroup} data-testid="button-back-loading">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Thread view - error state (no data after loading)
  if (viewMode === 'thread' && !threadLoading && !threadData) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink className="cursor-pointer" onClick={handleBackToList}>Community</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBackToList} data-testid="button-back-error">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Discussion Not Found</h1>
            <p className="text-muted-foreground text-sm">This discussion may have been removed or you don't have access.</p>
          </div>
        </div>
        
        <Button variant="outline" onClick={handleBackToList}>
          Back to Community
        </Button>
      </div>
    );
  }

  // Thread view
  if (viewMode === 'thread' && threadData) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink className="cursor-pointer" onClick={handleBackToList}>Community</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink className="cursor-pointer" onClick={handleBackToGroup}>{threadData.group.name}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{threadData.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="ghost" size="icon" onClick={handleBackToGroup} className="shrink-0" data-testid="button-back-to-group">
            <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold truncate" data-testid="text-thread-title">{threadData.title}</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Started by {threadData.authorName} {threadData.isOperator && <Badge variant="outline" className="ml-1 text-xs">Staff</Badge>}
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-4 md:pt-6">
            <ScrollArea className="h-[300px] md:h-[400px]">
              <div className="space-y-4">
                {/* Original post */}
                <div className="flex gap-4">
                  <Avatar>
                    <AvatarFallback>{threadData.authorName.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{threadData.authorName}</span>
                      {threadData.isOperator && <Badge variant="outline">Staff</Badge>}
                      <span className="text-sm text-muted-foreground">{format(new Date(threadData.createdAt), "PPp")}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap">{threadData.content}</p>
                  </div>
                </div>

                {threadData.posts.length > 0 && <Separator className="my-4" />}

                {/* Replies */}
                {threadData.posts.map((post) => (
                  <div key={post.id} className="flex gap-4" data-testid={`post-${post.id}`}>
                    <Avatar>
                      <AvatarFallback>{post.authorName.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{post.authorName}</span>
                        {post.isOperator && <Badge variant="outline">Staff</Badge>}
                        <span className="text-sm text-muted-foreground">{format(new Date(post.createdAt), "PPp")}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap">{post.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Reply form */}
        {!threadData.isLocked && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Reply to this thread</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Textarea
                  placeholder="Write your reply..."
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  rows={3}
                  className="flex-1"
                  data-testid="input-reply-content"
                />
              </div>
              <div className="flex justify-end mt-3">
                <Button
                  onClick={() => createPostMutation.mutate(replyContent)}
                  disabled={!replyContent.trim() || createPostMutation.isPending}
                  data-testid="button-submit-reply"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {createPostMutation.isPending ? "Posting..." : "Post Reply"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Group view - loading state
  if (viewMode === 'group' && groupsLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink className="cursor-pointer" onClick={handleBackToList}>Community</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <Skeleton className="h-4 w-24" />
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBackToList} data-testid="button-back-loading">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  // Group view - error state (no group found)
  if (viewMode === 'group' && !groupsLoading && !currentGroup) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink className="cursor-pointer" onClick={handleBackToList}>Community</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBackToList} data-testid="button-back-error">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">Group Not Found</h1>
            <p className="text-muted-foreground text-sm">This group may have been removed or you don't have access.</p>
          </div>
        </div>
        
        <Button variant="outline" onClick={handleBackToList}>
          Back to Community
        </Button>
      </div>
    );
  }

  // Group view (threads list)
  if (viewMode === 'group' && currentGroup) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink className="cursor-pointer" onClick={handleBackToList}>Community</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{currentGroup.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <Button variant="ghost" size="icon" onClick={handleBackToList} className="shrink-0" data-testid="button-back-to-list">
              <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl lg:text-3xl font-bold truncate" data-testid="text-group-name">{currentGroup.name}</h1>
              <p className="text-xs md:text-sm text-muted-foreground truncate">{currentGroup.blockName}</p>
            </div>
          </div>
          <Button onClick={() => setShowCreateThread(true)} className="w-full sm:w-auto shrink-0" data-testid="button-new-thread">
            <Plus className="h-4 w-4 mr-2" />
            New Thread
          </Button>
        </div>

        {threadsLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : threads.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No discussions yet. Start the conversation!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {threads.map((thread) => (
              <Card 
                key={thread.id} 
                className="cursor-pointer hover-elevate"
                onClick={() => handleViewThread(thread.id)}
                data-testid={`card-thread-${thread.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {thread.isPinned && <Badge variant="secondary">Pinned</Badge>}
                        {thread.title}
                        {thread.isLocked && <Badge variant="outline">Locked</Badge>}
                      </CardTitle>
                      <CardDescription>
                        by {thread.authorName} {thread.isOperator && <Badge variant="outline" className="ml-1">Staff</Badge>} | {format(new Date(thread.createdAt), "PP")}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {thread.viewCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {thread.replyCount}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-2">{thread.content}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Thread Dialog */}
        <Dialog open={showCreateThread} onOpenChange={setShowCreateThread}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start a New Discussion</DialogTitle>
              <DialogDescription>
                Create a new thread in {currentGroup.name}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="thread-title">Title</Label>
                <Input
                  id="thread-title"
                  placeholder="Discussion title..."
                  value={newThreadTitle}
                  onChange={(e) => setNewThreadTitle(e.target.value)}
                  data-testid="input-thread-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="thread-content">Content</Label>
                <Textarea
                  id="thread-content"
                  placeholder="What would you like to discuss?"
                  value={newThreadContent}
                  onChange={(e) => setNewThreadContent(e.target.value)}
                  rows={5}
                  data-testid="input-thread-content"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateThread(false)} data-testid="button-cancel-thread">
                Cancel
              </Button>
              <Button
                onClick={() => createThreadMutation.mutate({ title: newThreadTitle, content: newThreadContent })}
                disabled={!newThreadTitle.trim() || !newThreadContent.trim() || createThreadMutation.isPending}
                data-testid="button-submit-thread"
              >
                {createThreadMutation.isPending ? "Creating..." : "Create Thread"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Main list view
  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 md:space-y-6">
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

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Shield className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
            <span className="truncate">Community Moderation</span>
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">Manage community groups and moderate content</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={() => setShowCreateGroup(true)} className="w-full sm:w-auto" data-testid="button-create-group">
            <Plus className="h-4 w-4 mr-2" />
            Create Group
          </Button>
          <Button onClick={() => {
            setRulesText(currentRules?.rulesText || "");
            setShowRulesEditor(true);
          }} className="w-full sm:w-auto" data-testid="button-edit-rules">
            <Settings className="h-4 w-4 mr-2" />
            Edit Community Rules
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs md:text-sm">Pending Groups</CardDescription>
            <CardTitle className="text-2xl md:text-3xl" data-testid="text-pending-count">{pendingCount.count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs md:text-sm">Active Groups</CardDescription>
            <CardTitle className="text-2xl md:text-3xl" data-testid="text-approved-count">{approvedGroups.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs md:text-sm">Open Flags</CardDescription>
            <CardTitle className="text-2xl md:text-3xl" data-testid="text-flags-count">{unresolvedFlags.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs md:text-sm">Rules Version</CardDescription>
            <CardTitle className="text-2xl md:text-3xl" data-testid="text-rules-version">{currentRules?.version || 0}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto flex-wrap">
          <TabsTrigger value="groups" className="flex-1 sm:flex-initial" data-testid="tab-groups">
            <Users className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
            <span className="text-xs md:text-sm">Groups</span>
            {pendingCount.count > 0 && (
              <Badge variant="destructive" className="ml-1 md:ml-2 text-xs">{pendingCount.count}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="flags" className="flex-1 sm:flex-initial" data-testid="tab-flags">
            <Flag className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
            <span className="text-xs md:text-sm">Flagged</span>
            {unresolvedFlags.length > 0 && (
              <Badge variant="destructive" className="ml-1 md:ml-2 text-xs">{unresolvedFlags.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="log" className="flex-1 sm:flex-initial" data-testid="tab-log">
            <FileText className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
            <span className="text-xs md:text-sm">Log</span>
          </TabsTrigger>
          <TabsTrigger value="blocked" className="flex-1 sm:flex-initial" data-testid="tab-blocked">
            <Ban className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
            <span className="text-xs md:text-sm">Blocked</span>
            {blockedTenants.length > 0 && (
              <Badge variant="secondary" className="ml-1 md:ml-2 text-xs">{blockedTenants.length}</Badge>
            )}
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
                <Button className="mt-4" onClick={() => setShowCreateGroup(true)} data-testid="button-create-first-group">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Group
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingGroups.length > 0 && (
                <div>
                  <h3 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4 md:h-5 md:w-5 text-amber-500 shrink-0" />
                    <span>Pending Approval ({pendingGroups.length})</span>
                  </h3>
                  <div className="space-y-3">
                    {pendingGroups.map((group) => (
                      <Card key={group.id} className="border-amber-200 dark:border-amber-800" data-testid={`card-pending-group-${group.id}`}>
                        <CardHeader className="p-4 md:p-6">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm md:text-base" data-testid={`text-group-name-${group.id}`}>
                                {group.name}
                              </CardTitle>
                              <CardDescription className="text-xs md:text-sm">
                                {group.blockName} | Created by {group.creatorName} | {format(new Date(group.createdAt), "PP")}
                              </CardDescription>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                              <Button
                                size="sm"
                                onClick={() => approveGroupMutation.mutate(group.id)}
                                disabled={approveGroupMutation.isPending}
                                className="flex-1 sm:flex-initial"
                                data-testid={`button-approve-${group.id}`}
                              >
                                <Check className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setSelectedGroupForReject(group)}
                                className="flex-1 sm:flex-initial"
                                data-testid={`button-reject-${group.id}`}
                              >
                                <X className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        {group.description && (
                          <CardContent className="pt-0 px-4 md:px-6 pb-4 md:pb-6">
                            <p className="text-xs md:text-sm text-muted-foreground">{group.description}</p>
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {approvedGroups.length > 0 && (
                <div>
                  <h3 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-500 shrink-0" />
                    <span>Active Groups ({approvedGroups.length})</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                    {approvedGroups.map((group) => (
                      <Card 
                        key={group.id} 
                        className="cursor-pointer hover-elevate overflow-hidden"
                        onClick={() => handleViewGroup(group.id)}
                        data-testid={`card-approved-group-${group.id}`}
                      >
                        {group.coverImageUrl && (
                          <div className="relative h-32 w-full">
                            <img
                              src={group.coverImageUrl}
                              alt={group.name}
                              className="w-full h-full object-cover"
                              data-testid={`img-group-banner-${group.id}`}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                          </div>
                        )}
                        <CardHeader className={group.coverImageUrl ? "pt-3 pb-2 px-3 md:px-6" : "pb-2 px-3 md:px-6"}>
                          <CardTitle className="text-sm md:text-base">{group.name}</CardTitle>
                          <CardDescription className="text-xs md:text-sm">{group.blockName}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex gap-4 text-xs md:text-sm text-muted-foreground px-3 md:px-6 pb-3 md:pb-6">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3 shrink-0" />
                            {group.memberCount}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3 shrink-0" />
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
                  <h3 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
                    <X className="h-4 w-4 md:h-5 md:w-5 text-destructive shrink-0" />
                    <span>Rejected Groups ({rejectedGroups.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {rejectedGroups.map((group) => (
                      <Card key={group.id} className="opacity-75" data-testid={`card-rejected-group-${group.id}`}>
                        <CardHeader className="py-3 px-4 md:px-6">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm md:text-base">{group.name}</CardTitle>
                              <CardDescription className="text-xs md:text-sm">
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
                  <h3 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-amber-500 shrink-0" />
                    <span>Needs Review ({unresolvedFlags.length})</span>
                  </h3>
                  <div className="space-y-3">
                    {unresolvedFlags.map((flag) => (
                      <Card key={flag.id} className="border-amber-200 dark:border-amber-800" data-testid={`card-flag-${flag.id}`}>
                        <CardHeader className="p-4 md:p-6">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm md:text-base flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="text-xs">{flag.content?.type}</Badge>
                                <span className="truncate">{flag.content?.title || "Reply"}</span>
                              </CardTitle>
                              <CardDescription className="text-xs md:text-sm">
                                Reported by {flag.reporterName} | {format(new Date(flag.createdAt), "PPp")}
                              </CardDescription>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => setSelectedFlag(flag)}
                              className="w-full sm:w-auto"
                              data-testid={`button-review-flag-${flag.id}`}
                            >
                              <Eye className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                              Review
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 px-4 md:px-6 pb-4 md:pb-6">
                          <div className="text-xs md:text-sm mb-2">
                            <span className="font-medium">Reason:</span> {flag.reason}
                          </div>
                          {flag.details && (
                            <div className="text-xs md:text-sm text-muted-foreground">
                              <span className="font-medium">Details:</span> {flag.details}
                            </div>
                          )}
                          <Separator className="my-3" />
                          <div className="text-xs md:text-sm p-3 bg-muted/50 rounded-md">
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
                  <h3 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-500 shrink-0" />
                    <span>Resolved ({flags.filter(f => f.isResolved).length})</span>
                  </h3>
                  <div className="space-y-2">
                    {flags.filter(f => f.isResolved).map((flag) => (
                      <Card key={flag.id} className="opacity-75">
                        <CardHeader className="py-3 px-4 md:px-6">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-sm md:text-base">{flag.content?.title || flag.content?.type}</CardTitle>
                              <CardDescription className="text-xs md:text-sm">
                                {flag.reason} | Resolved {format(new Date(flag.createdAt), "PP")}
                              </CardDescription>
                            </div>
                            <Badge variant="secondary" className="text-xs">Resolved</Badge>
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

        <TabsContent value="blocked" className="mt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-base md:text-lg font-semibold">Blocked Tenants</h3>
              <p className="text-xs md:text-sm text-muted-foreground">Tenants who are blocked cannot post or reply in the community</p>
            </div>
            <Button onClick={() => setShowBlockTenantDialog(true)} className="w-full sm:w-auto" data-testid="button-block-tenant">
              <Ban className="h-4 w-4 mr-2" />
              Block Tenant
            </Button>
          </div>
          
          {blockedLoading ? (
            <Skeleton className="h-48" />
          ) : blockedTenants.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                <UserX className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No tenants are currently blocked from the community.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {blockedTenants.map((block) => (
                <Card key={block.id} data-testid={`blocked-tenant-${block.tenantUserId}`}>
                  <CardHeader className="py-4 px-4 md:px-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar className="shrink-0">
                          <AvatarFallback className="text-xs">
                            {block.tenantName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-sm md:text-base truncate">{block.tenantName}</CardTitle>
                          <CardDescription className="text-xs md:text-sm">
                            {block.tenantEmail} | Blocked by {block.blockedByName} on {format(new Date(block.createdAt), "PP")}
                          </CardDescription>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unblockTenantMutation.mutate(block.tenantUserId)}
                        disabled={unblockTenantMutation.isPending}
                        className="w-full sm:w-auto"
                        data-testid={`button-unblock-${block.tenantUserId}`}
                      >
                        Unblock
                      </Button>
                    </div>
                    {block.reason && (
                      <p className="text-xs md:text-sm text-muted-foreground mt-2 ml-0 sm:ml-12">
                        Reason: {block.reason}
                      </p>
                    )}
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Block Tenant Dialog */}
      <Dialog open={showBlockTenantDialog} onOpenChange={setShowBlockTenantDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block Tenant from Community</DialogTitle>
            <DialogDescription>
              Select a tenant to block them from posting in the community. They will not be able to create threads or replies.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="tenant-select">Select Tenant</Label>
              <Select
                value={blockTenantUserId}
                onValueChange={setBlockTenantUserId}
              >
                <SelectTrigger data-testid="select-block-tenant">
                  <SelectValue placeholder="Choose a tenant to block..." />
                </SelectTrigger>
                <SelectContent>
                  {activeTenants
                    .filter(tenant => !blockedTenants.some(b => b.tenantUserId === tenant.id))
                    .map(tenant => (
                      <SelectItem key={tenant.id} value={tenant.id} data-testid={`select-tenant-${tenant.id}`}>
                        {tenant.name} ({tenant.email})
                      </SelectItem>
                    ))}
                  {activeTenants.filter(t => !blockedTenants.some(b => b.tenantUserId === t.id)).length === 0 && (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No tenants available to block
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="block-reason">Reason (optional)</Label>
              <Textarea
                id="block-reason"
                placeholder="Why is this tenant being blocked?"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                rows={3}
                data-testid="input-block-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockTenantDialog(false)} data-testid="button-cancel-block">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => blockTenantMutation.mutate({ tenantUserId: blockTenantUserId, reason: blockReason || undefined })}
              disabled={!blockTenantUserId.trim() || blockTenantMutation.isPending}
              data-testid="button-confirm-block"
            >
              {blockTenantMutation.isPending ? "Blocking..." : "Block Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Group Dialog */}
      <Dialog open={!!selectedGroupForReject} onOpenChange={(open) => !open && setSelectedGroupForReject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Group</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting "{selectedGroupForReject?.name}". The creator will be notified.
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
            <Button variant="outline" onClick={() => setSelectedGroupForReject(null)} data-testid="button-cancel-reject">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedGroupForReject) {
                  rejectGroupMutation.mutate({ groupId: selectedGroupForReject.id, reason: rejectionReason });
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

      {/* Flag Review Dialog */}
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
              <Label>Resolution Notes (optional)</Label>
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

      {/* Create Group Dialog */}
      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Community Group</DialogTitle>
            <DialogDescription>
              Create a new community group for tenants to discuss and share.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                placeholder="e.g., Building Announcements"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                data-testid="input-group-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-block">Block</Label>
              <Select value={newGroupBlockId} onValueChange={setNewGroupBlockId}>
                <SelectTrigger data-testid="select-group-block">
                  <SelectValue placeholder="Select a block" />
                </SelectTrigger>
                <SelectContent>
                  {blocks.map((block) => (
                    <SelectItem key={block.id} value={block.id}>
                      {block.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-description">Description (optional)</Label>
              <Textarea
                id="group-description"
                placeholder="What is this group about?"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                rows={3}
                data-testid="input-group-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateGroup(false)} data-testid="button-cancel-create-group">
              Cancel
            </Button>
            <Button
              onClick={() => createGroupMutation.mutate({ 
                name: newGroupName, 
                description: newGroupDescription, 
                blockId: newGroupBlockId 
              })}
              disabled={!newGroupName.trim() || !newGroupBlockId || createGroupMutation.isPending}
              data-testid="button-submit-create-group"
            >
              {createGroupMutation.isPending ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rules Editor Dialog */}
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
              {saveRulesMutation.isPending ? "Saving..." : "Save Rules"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
