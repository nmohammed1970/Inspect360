import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Users, MessageSquare, Plus, ArrowLeft, ChevronRight, Eye, Clock, 
  Pin, Lock, Flag, AlertTriangle, CheckCircle, Send, Image as ImageIcon 
} from "lucide-react";
import { useLocation, Link } from "wouter";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { format } from "date-fns";

interface CommunityGroup {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  memberCount: number;
  postCount: number;
  status: string;
  isMember: boolean;
}

interface CommunityThread {
  id: string;
  title: string;
  content: string;
  createdBy: string;
  creatorName: string;
  viewCount: number;
  replyCount: number;
  isPinned: boolean;
  isLocked: boolean;
  status: string;
  createdAt: string;
  lastActivityAt: string;
}

interface CommunityPost {
  id: string;
  content: string;
  createdBy: string;
  creatorName: string;
  isEdited: boolean;
  createdAt: string;
  attachments: { id: string; fileUrl: string; fileName: string }[];
}

interface CommunityRules {
  rules: string | null;
  version: number;
  hasAccepted: boolean;
}

export default function TenantCommunity() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedGroup, setSelectedGroup] = useState<CommunityGroup | null>(null);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateThread, setShowCreateThread] = useState(false);
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [showFlagDialog, setShowFlagDialog] = useState<{ type: 'thread' | 'post'; id: string } | null>(null);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [newThreadContent, setNewThreadContent] = useState("");
  const [newReplyContent, setNewReplyContent] = useState("");
  const [flagReason, setFlagReason] = useState("");
  const [flagDetails, setFlagDetails] = useState("");

  const { data: rulesData, isLoading: rulesLoading } = useQuery<CommunityRules>({
    queryKey: ["/api/tenant-portal/community/rules"],
  });

  const { data: groups = [], isLoading: groupsLoading } = useQuery<CommunityGroup[]>({
    queryKey: ["/api/tenant-portal/community/groups"],
  });

  const { data: threads = [], isLoading: threadsLoading } = useQuery<CommunityThread[]>({
    queryKey: ["/api/tenant-portal/community/groups", selectedGroup?.id, "threads"],
    enabled: !!selectedGroup,
  });

  const { data: threadDetail, isLoading: threadLoading } = useQuery<any>({
    queryKey: ["/api/tenant-portal/community/threads", selectedThread],
    enabled: !!selectedThread,
  });

  const acceptRulesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/tenant-portal/community/rules/accept"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-portal/community/rules"] });
      setShowRulesDialog(false);
      toast({ title: "Rules accepted", description: "You can now participate in community discussions." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to accept rules", variant: "destructive" });
    },
  });

  const joinGroupMutation = useMutation({
    mutationFn: (groupId: string) => apiRequest("POST", `/api/tenant-portal/community/groups/${groupId}/join`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-portal/community/groups"] });
      toast({ title: "Joined group", description: "You are now a member of this group." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to join group", variant: "destructive" });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: (data: { name: string; description: string }) => 
      apiRequest("POST", "/api/tenant-portal/community/groups", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-portal/community/groups"] });
      setShowCreateGroup(false);
      setNewGroupName("");
      setNewGroupDescription("");
      toast({ title: "Group created", description: "Your group is pending approval from the property manager." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create group", variant: "destructive" });
    },
  });

  const createThreadMutation = useMutation({
    mutationFn: (data: { title: string; content: string }) => 
      apiRequest("POST", `/api/tenant-portal/community/groups/${selectedGroup?.id}/threads`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-portal/community/groups", selectedGroup?.id, "threads"] });
      setShowCreateThread(false);
      setNewThreadTitle("");
      setNewThreadContent("");
      toast({ title: "Thread created" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create thread", variant: "destructive" });
    },
  });

  const createReplyMutation = useMutation({
    mutationFn: (data: { content: string }) => 
      apiRequest("POST", `/api/tenant-portal/community/threads/${selectedThread}/posts`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant-portal/community/threads", selectedThread] });
      setNewReplyContent("");
      toast({ title: "Reply posted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to post reply", variant: "destructive" });
    },
  });

  const flagContentMutation = useMutation({
    mutationFn: (data: { threadId?: string; postId?: string; reason: string; details: string }) => 
      apiRequest("POST", "/api/tenant-portal/community/flag", data),
    onSuccess: () => {
      setShowFlagDialog(null);
      setFlagReason("");
      setFlagDetails("");
      toast({ title: "Content flagged", description: "Thank you for reporting. Our moderators will review this." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to flag content", variant: "destructive" });
    },
  });

  const requiresRulesAcceptance = rulesData && rulesData.version > 0 && !rulesData.hasAccepted;

  if (rulesLoading || groupsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (selectedThread && threadDetail) {
    return (
      <div className="p-6 space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink className="cursor-pointer" onClick={() => navigate("/tenant")}>Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink className="cursor-pointer" onClick={() => { setSelectedThread(null); setSelectedGroup(null); }}>Community</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink className="cursor-pointer" onClick={() => setSelectedThread(null)}>{threadDetail.group?.name}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{threadDetail.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setSelectedThread(null)} data-testid="button-back-threads">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-thread-title">
              {threadDetail.isPinned && <Pin className="h-5 w-5 text-primary" />}
              {threadDetail.isLocked && <Lock className="h-5 w-5 text-muted-foreground" />}
              {threadDetail.title}
            </h1>
            <p className="text-muted-foreground text-sm">
              Posted by {threadDetail.creatorName} {format(new Date(threadDetail.createdAt), "PPp")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFlagDialog({ type: 'thread', id: threadDetail.id })}
            data-testid="button-flag-thread"
          >
            <Flag className="h-4 w-4 mr-1" />
            Report
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap" data-testid="text-thread-content">
              {threadDetail.content}
            </div>
            {threadDetail.attachments?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {threadDetail.attachments.map((att: any) => (
                  <a key={att.id} href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm">
                    {att.fileName}
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{threadDetail.posts?.length || 0} Replies</h3>
          
          {threadDetail.posts?.map((post: CommunityPost) => (
            <Card key={post.id} data-testid={`card-post-${post.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium" data-testid={`text-post-author-${post.id}`}>{post.creatorName}</span>
                    <span className="text-muted-foreground text-sm ml-2">
                      {format(new Date(post.createdAt), "PPp")}
                      {post.isEdited && " (edited)"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFlagDialog({ type: 'post', id: post.id })}
                    data-testid={`button-flag-post-${post.id}`}
                  >
                    <Flag className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap" data-testid={`text-post-content-${post.id}`}>{post.content}</div>
                {post.attachments?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {post.attachments.map((att) => (
                      <a key={att.id} href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm">
                        {att.fileName}
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {!threadDetail.isLocked && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Post a Reply</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Write your reply..."
                  value={newReplyContent}
                  onChange={(e) => setNewReplyContent(e.target.value)}
                  rows={4}
                  data-testid="input-reply-content"
                />
              </CardContent>
              <CardFooter>
                <Button
                  onClick={() => createReplyMutation.mutate({ content: newReplyContent })}
                  disabled={!newReplyContent.trim() || createReplyMutation.isPending}
                  data-testid="button-post-reply"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {createReplyMutation.isPending ? "Posting..." : "Post Reply"}
                </Button>
              </CardFooter>
            </Card>
          )}

          {threadDetail.isLocked && (
            <Card className="bg-muted/50">
              <CardContent className="pt-6 flex items-center gap-2 text-muted-foreground">
                <Lock className="h-5 w-5" />
                This thread is locked. New replies are not allowed.
              </CardContent>
            </Card>
          )}
        </div>

        <Dialog open={!!showFlagDialog} onOpenChange={(open) => !open && setShowFlagDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Report Content
              </DialogTitle>
              <DialogDescription>
                Help keep our community safe by reporting inappropriate content.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Reason</label>
                <Input
                  placeholder="e.g., Inappropriate language, spam, harassment"
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  data-testid="input-flag-reason"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Details (optional)</label>
                <Textarea
                  placeholder="Provide additional context..."
                  value={flagDetails}
                  onChange={(e) => setFlagDetails(e.target.value)}
                  rows={3}
                  data-testid="input-flag-details"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFlagDialog(null)} data-testid="button-cancel-flag">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (showFlagDialog) {
                    flagContentMutation.mutate({
                      threadId: showFlagDialog.type === 'thread' ? showFlagDialog.id : undefined,
                      postId: showFlagDialog.type === 'post' ? showFlagDialog.id : undefined,
                      reason: flagReason,
                      details: flagDetails,
                    });
                  }
                }}
                disabled={!flagReason.trim() || flagContentMutation.isPending}
                data-testid="button-submit-flag"
              >
                {flagContentMutation.isPending ? "Submitting..." : "Submit Report"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (selectedGroup) {
    return (
      <div className="p-6 space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink className="cursor-pointer" onClick={() => navigate("/tenant")}>Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink className="cursor-pointer" onClick={() => setSelectedGroup(null)}>Community</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{selectedGroup.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setSelectedGroup(null)} data-testid="button-back-groups">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold" data-testid="text-group-name">{selectedGroup.name}</h1>
            <p className="text-muted-foreground">{selectedGroup.description}</p>
          </div>
          {selectedGroup.isMember && !requiresRulesAcceptance && (
            <Button onClick={() => setShowCreateThread(true)} data-testid="button-new-thread">
              <Plus className="h-4 w-4 mr-2" />
              New Thread
            </Button>
          )}
          {!selectedGroup.isMember && (
            <Button
              onClick={() => {
                if (requiresRulesAcceptance) {
                  setShowRulesDialog(true);
                } else {
                  joinGroupMutation.mutate(selectedGroup.id);
                }
              }}
              disabled={joinGroupMutation.isPending}
              data-testid="button-join-group"
            >
              {joinGroupMutation.isPending ? "Joining..." : "Join Group"}
            </Button>
          )}
        </div>

        <div className="flex gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {selectedGroup.memberCount} members
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            {selectedGroup.postCount} posts
          </span>
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
              <p>No threads yet. Be the first to start a discussion!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {threads.map((thread) => (
              <Card
                key={thread.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedThread(thread.id)}
                data-testid={`card-thread-${thread.id}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    {thread.isPinned && <Pin className="h-4 w-4 text-primary" />}
                    {thread.isLocked && <Lock className="h-4 w-4 text-muted-foreground" />}
                    <CardTitle className="text-base flex-1" data-testid={`text-thread-title-${thread.id}`}>
                      {thread.title}
                    </CardTitle>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="text-sm text-muted-foreground line-clamp-2">{thread.content}</p>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {thread.viewCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {thread.replyCount} replies
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(thread.lastActivityAt), "PP")}
                    </span>
                    <span>by {thread.creatorName}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showCreateThread} onOpenChange={setShowCreateThread}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Thread</DialogTitle>
              <DialogDescription>Start a discussion in {selectedGroup.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input
                  placeholder="What would you like to discuss?"
                  value={newThreadTitle}
                  onChange={(e) => setNewThreadTitle(e.target.value)}
                  data-testid="input-thread-title"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Content</label>
                <Textarea
                  placeholder="Share your thoughts..."
                  value={newThreadContent}
                  onChange={(e) => setNewThreadContent(e.target.value)}
                  rows={6}
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
                data-testid="button-create-thread"
              >
                {createThreadMutation.isPending ? "Creating..." : "Create Thread"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink className="cursor-pointer" onClick={() => navigate("/tenant")}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Community</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-community-title">Community</h1>
          <p className="text-muted-foreground">Connect with your neighbors</p>
        </div>
        <Button
          onClick={() => {
            if (requiresRulesAcceptance) {
              setShowRulesDialog(true);
            } else {
              setShowCreateGroup(true);
            }
          }}
          data-testid="button-create-group"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Group
        </Button>
      </div>

      {requiresRulesAcceptance && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-6 w-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold mb-1">Accept Community Guidelines</h3>
                <p className="text-muted-foreground text-sm mb-3">
                  To participate in community discussions, you must first read and accept our community guidelines.
                </p>
                <Button size="sm" onClick={() => setShowRulesDialog(true)} data-testid="button-view-rules">
                  View Guidelines
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {groups.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No Community Groups Yet</h3>
            <p className="text-muted-foreground mb-4">
              Be the first to create a community group for your building!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <Card
              key={group.id}
              className="hover-elevate cursor-pointer"
              onClick={() => setSelectedGroup(group)}
              data-testid={`card-group-${group.id}`}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate" data-testid={`text-group-name-${group.id}`}>
                      {group.name}
                    </CardTitle>
                    {group.isMember && (
                      <Badge variant="secondary" className="mt-1">Member</Badge>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
              </CardHeader>
              {group.description && (
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground line-clamp-2">{group.description}</p>
                </CardContent>
              )}
              <CardFooter className="text-xs text-muted-foreground gap-4 flex-wrap">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {group.memberCount} members
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {group.postCount} posts
                </span>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showRulesDialog} onOpenChange={setShowRulesDialog}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Community Guidelines</DialogTitle>
            <DialogDescription>
              Please read and accept these guidelines to participate in community discussions.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[40vh] pr-4">
            <div className="prose dark:prose-invert text-sm whitespace-pre-wrap">
              {rulesData?.rules || `Welcome to our Community!

To ensure a positive experience for everyone, please follow these guidelines:

1. Be Respectful
   - Treat all community members with respect and courtesy
   - No harassment, bullying, or discriminatory language
   - Respect privacy - don't share others' personal information

2. Keep It Civil
   - No hate speech, racism, or discriminatory content
   - Avoid offensive language and inappropriate content
   - Keep discussions constructive and on-topic

3. No Inappropriate Content
   - No sexually explicit material
   - No violent or graphic content
   - Keep content family-friendly

4. Stay On Topic
   - Keep posts relevant to your building community
   - Use appropriate groups for different topics
   - No spam or excessive self-promotion

5. Report Issues
   - Report any content that violates these guidelines
   - Contact your property manager for serious concerns

Violations may result in content removal or loss of community privileges.`}
            </div>
          </ScrollArea>
          <div className="flex items-center gap-2 pt-4 border-t">
            <Checkbox
              id="accept-rules"
              checked={rulesAccepted}
              onCheckedChange={(checked) => setRulesAccepted(checked as boolean)}
              data-testid="checkbox-accept-rules"
            />
            <label htmlFor="accept-rules" className="text-sm">
              I have read and agree to follow these community guidelines
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRulesDialog(false)} data-testid="button-cancel-rules">
              Cancel
            </Button>
            <Button
              onClick={() => acceptRulesMutation.mutate()}
              disabled={!rulesAccepted || acceptRulesMutation.isPending}
              data-testid="button-accept-rules"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {acceptRulesMutation.isPending ? "Accepting..." : "Accept Guidelines"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Community Group</DialogTitle>
            <DialogDescription>
              Create a new discussion group for your building community. Groups require approval from the property manager.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Group Name</label>
              <Input
                placeholder="e.g., Building Social Events, Pet Owners Club"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                data-testid="input-group-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea
                placeholder="What is this group about?"
                value={newGroupDescription}
                onChange={(e) => setNewGroupDescription(e.target.value)}
                rows={3}
                data-testid="input-group-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateGroup(false)} data-testid="button-cancel-group">
              Cancel
            </Button>
            <Button
              onClick={() => createGroupMutation.mutate({ name: newGroupName, description: newGroupDescription })}
              disabled={!newGroupName.trim() || createGroupMutation.isPending}
              data-testid="button-submit-group"
            >
              {createGroupMutation.isPending ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
