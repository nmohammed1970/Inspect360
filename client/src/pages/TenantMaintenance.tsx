import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Send, ImagePlus, Loader2, CheckCircle2, AlertCircle, MessageSquare, ArrowLeft } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { extractFileUrlFromUploadResponse } from "@/lib/utils";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  aiSuggestedFixes?: string;
  createdAt: string;
}

interface Chat {
  id: string;
  title: string;
  status: string;
  maintenanceRequestId?: string;
  createdAt: string;
  messages?: ChatMessage[];
}

export default function TenantMaintenance() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: chats = [], isLoading: isLoadingChats } = useQuery<Chat[]>({
    queryKey: ["/api/tenant/maintenance-chats"],
  });

  const { data: currentChat, isLoading: isLoadingChat } = useQuery<Chat>({
    queryKey: ["/api/tenant/maintenance-chats", selectedChatId],
    enabled: !!selectedChatId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { chatId?: string; message: string; imageUrl?: string }) => {
      const res = await apiRequest("POST", "/api/tenant/maintenance-chat/message", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/maintenance-chats"] });
      if (selectedChatId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tenant/maintenance-chats", selectedChatId] });
      }
      setMessageInput("");
      setUploadedImage(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const createMaintenanceMutation = useMutation({
    mutationFn: async (chatId: string) => {
      const res = await apiRequest("POST", "/api/tenant/maintenance-chat/create-request", { chatId });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Maintenance Request Created",
        description: "Your maintenance request has been submitted to the property manager",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tenant/maintenance-chats"] });
      if (selectedChatId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tenant/maintenance-chats", selectedChatId] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create maintenance request",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentChat?.messages]);

  const handleSendMessage = async () => {
    if (!messageInput.trim() && !uploadedImage) return;

    const chatId = selectedChatId || undefined;
    const newMessage = await sendMessageMutation.mutateAsync({
      chatId,
      message: messageInput,
      imageUrl: uploadedImage || undefined,
    });

    if (!selectedChatId && newMessage.chatId) {
      setSelectedChatId(newMessage.chatId);
    }
  };

  const handleCreateRequest = () => {
    if (!selectedChatId) return;
    createMaintenanceMutation.mutate(selectedChatId);
  };

  if (isLoadingChats) {
    return (
      <div className="p-6">
        <Skeleton className="h-12 w-64 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 md:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="p-6 border-b flex-shrink-0">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/tenant/home">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Maintenance</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate("/tenant/home")}
            data-testid="button-back-home"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              AI Maintenance Help
            </h1>
            <p className="text-muted-foreground text-sm">
              Get instant help with property issues
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 min-h-0">
        {/* Chat History Sidebar */}
        <div className="border-r p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Conversations</h3>
            <Button
              size="sm"
              onClick={() => setSelectedChatId(null)}
              data-testid="button-new-chat"
            >
              New Chat
            </Button>
          </div>
          <div className="space-y-2">
            {chats.map((chat) => (
              <Card
                key={chat.id}
                className={`cursor-pointer hover-elevate ${
                  selectedChatId === chat.id ? "border-primary bg-primary/5" : ""
                }`}
                onClick={() => setSelectedChatId(chat.id)}
                data-testid={`chat-${chat.id}`}
              >
                <CardHeader className="p-4 space-y-2">
                  <CardTitle className="text-sm line-clamp-2">{chat.title}</CardTitle>
                  <div className="flex items-center justify-between">
                    <Badge variant={chat.status === "active" ? "default" : "secondary"} className="text-xs">
                      {chat.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(chat.createdAt), "MMM dd")}
                    </span>
                  </div>
                  {chat.maintenanceRequestId && (
                    <Badge variant="outline" className="text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Request Created
                    </Badge>
                  )}
                </CardHeader>
              </Card>
            ))}
            {chats.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No conversations yet. Start a new chat to get help!
              </div>
            )}
          </div>
        </div>

        {/* Chat Interface */}
        <div className="md:col-span-2 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {!selectedChatId && !isLoadingChat && (
              <div className="flex items-center justify-center h-full">
                <Card className="max-w-lg">
                  <CardHeader>
                    <CardTitle>Welcome to AI Maintenance Help</CardTitle>
                    <CardDescription>
                      Describe your issue and upload a photo. Our AI will analyze it and suggest
                      solutions. If the issue isn't resolved, you can create a maintenance request.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            )}

            {isLoadingChat && <Skeleton className="h-32 w-full" />}

            {currentChat?.messages?.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {message.imageUrl && (
                    <img
                      src={message.imageUrl}
                      alt="Uploaded"
                      className="rounded-lg mb-2 max-w-full h-auto"
                    />
                  )}
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.aiSuggestedFixes && (
                    <div className="mt-3 p-3 bg-background/20 rounded-lg">
                      <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Suggested Fixes:
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{message.aiSuggestedFixes}</p>
                    </div>
                  )}
                  <div className="text-xs opacity-70 mt-2">
                    {format(new Date(message.createdAt), "HH:mm")}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t p-4 space-y-4">
            {currentChat && !currentChat.maintenanceRequestId && (
              <div className="flex justify-center">
                <Button
                  onClick={handleCreateRequest}
                  disabled={createMaintenanceMutation.isPending}
                  variant="outline"
                  data-testid="button-create-request"
                >
                  {createMaintenanceMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Issue Not Resolved - Create Maintenance Request
                </Button>
              </div>
            )}

            {uploadedImage && (
              <div className="relative inline-block">
                <img src={uploadedImage} alt="Preview" className="h-20 rounded-lg" />
                <Button
                  size="sm"
                  variant="destructive"
                  className="absolute -top-2 -right-2"
                  onClick={() => setUploadedImage(null)}
                >
                  ×
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <ObjectUploader
                buttonVariant="outline"
                buttonClassName="h-10 w-10"
                onGetUploadParameters={async () => {
                  try {
                    const response = await fetch('/api/objects/upload', {
                      method: 'POST',
                      credentials: 'include',
                    });
                    
                    if (!response.ok) {
                      throw new Error(`Failed to get upload URL: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    
                    if (!data.uploadURL) {
                      throw new Error("Invalid upload URL response");
                    }
                    
                    return {
                      method: 'PUT',
                      url: data.uploadURL,
                    };
                  } catch (error: any) {
                    console.error('[TenantMaintenance] Error getting upload parameters:', error);
                    toast({
                      title: "Upload Error",
                      description: error.message || "Failed to get upload URL. Please try again.",
                      variant: "destructive",
                    });
                    throw error;
                  }
                }}
                onComplete={(result) => {
                  try {
                    if (result.successful && result.successful.length > 0) {
                      const file = result.successful[0];
                      
                      // Extract file URL using the utility function (handles various response formats)
                      let uploadURL = extractFileUrlFromUploadResponse(file, file.response);
                      
                      // If extraction failed, try to use objectId from metadata as fallback
                      if (!uploadURL && file?.meta?.objectId) {
                        uploadURL = `/objects/${file.meta.objectId}`;
                      }
                      
                      // If still no URL, try direct access
                      if (!uploadURL && file?.uploadURL) {
                        uploadURL = file.uploadURL;
                      }
                      
                      if (!uploadURL) {
                        console.error('[TenantMaintenance] No upload URL found:', { file, result });
                        toast({
                          title: "Upload Error",
                          description: "Upload succeeded but could not get image URL. Please try again.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      // Normalize URL: if absolute, extract pathname; if relative, use as is
                      if (uploadURL && (uploadURL.startsWith('http://') || uploadURL.startsWith('https://'))) {
                        try {
                          const urlObj = new URL(uploadURL);
                          uploadURL = urlObj.pathname;
                        } catch (e) {
                          console.error('[TenantMaintenance] Invalid upload URL:', uploadURL);
                          toast({
                            title: "Upload Error",
                            description: "Invalid file URL format. Please try again.",
                            variant: "destructive",
                          });
                          return;
                        }
                      }
                      
                      // Ensure it's a relative path starting with /objects/
                      if (!uploadURL || !uploadURL.startsWith('/objects/')) {
                        toast({
                          title: "Upload Error",
                          description: "Invalid file URL format. Please try again.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      // Convert to absolute URL for display
                      const absoluteUrl = `${window.location.origin}${uploadURL}`;
                      setUploadedImage(absoluteUrl);
                      toast({
                        title: "Image Uploaded",
                        description: "Your image has been uploaded successfully",
                      });
                    } else if (result.failed && result.failed.length > 0) {
                      const error = result.failed[0];
                      toast({
                        title: "Upload Failed",
                        description: error.error?.message || "Failed to upload image. Please try again.",
                        variant: "destructive",
                      });
                    }
                  } catch (error: any) {
                    console.error('[TenantMaintenance] Error in onComplete:', error);
                    toast({
                      title: "Upload Error",
                      description: error.message || "An error occurred while processing the upload.",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid="button-upload-image"
              >
                <ImagePlus className="h-4 w-4" />
              </ObjectUploader>
              <Textarea
                placeholder="Describe the issue..."
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="flex-1 resize-none"
                rows={2}
                data-testid="input-message"
              />
              <Button
                onClick={handleSendMessage}
                disabled={sendMessageMutation.isPending || (!messageInput.trim() && !uploadedImage)}
                data-testid="button-send-message"
              >
                {sendMessageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
