import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle, Send, Bot, User, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import type { ChatMessage } from "@shared/schema";

export function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [showConversations, setShowConversations] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: conversations = [], isLoading: isLoadingConversations, error: conversationsError } = useQuery<any[]>({
    queryKey: ["/api/chat/conversations"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/chat/conversations");
      return response.json();
    },
    enabled: isOpen,
  });

  const { data: messages = [], isLoading: isLoadingMessages, error: messagesError } = useQuery<ChatMessage[]>({
    queryKey: conversationId ? ["/api/chat/conversations", conversationId, "messages"] : ["no-conversation"],
    queryFn: async () => {
      if (!conversationId) return [];
      const response = await apiRequest("GET", `/api/chat/conversations/${conversationId}/messages`);
      return response.json();
    },
    enabled: !!conversationId && isOpen,
    retry: false,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      let convId = conversationId;

      if (!convId) {
        const convResponse = await apiRequest("POST", "/api/chat/conversations", {
          title: message.substring(0, 50),
        });
        const convData: any = await convResponse.json();
        convId = convData.id;
        setConversationId(convId);
      }

      const messageResponse = await apiRequest("POST", `/api/chat/conversations/${convId}/messages`, {
        content: message,
      });
      await messageResponse.json();

      return convId;
    },
    onSuccess: (convId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations", convId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/conversations"] });
      setMessage("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Message Failed",
        description: error.message || "Failed to send message",
      });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sendMessageMutation.isPending) return;

    sendMessageMutation.mutate({ message: message.trim() });
  };

  const handleNewConversation = () => {
    setConversationId(null);
    setShowConversations(false);
  };

  const handleSelectConversation = (id: string) => {
    setConversationId(id);
    setShowConversations(false);
  };

  return (
    <>
      <Button
        size="icon"
        className="fixed bottom-24 right-6 h-14 w-14 rounded-full shadow-xl z-[99999] bg-primary hover:bg-primary/90 transition-all"
        onClick={() => setIsOpen(true)}
        data-testid="button-chatbot-open"
        style={{ position: 'fixed', bottom: '6rem', right: '1.5rem' }}
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl h-[600px] p-0 flex flex-col">
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <div>
                  <DialogTitle>AI Assistant</DialogTitle>
                  <p className="text-sm text-muted-foreground">Ask me anything about Inspect360</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {conversations.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowConversations(!showConversations)}
                    data-testid="button-show-conversations"
                  >
                    History ({conversations.length})
                  </Button>
                )}
                {conversationId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNewConversation}
                    data-testid="button-new-chat"
                  >
                    New Chat
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  data-testid="button-chatbot-close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            {showConversations ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold mb-4">Conversation History</h3>
                {isLoadingConversations ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : conversationsError ? (
                  <Alert variant="destructive">
                    <AlertDescription>Failed to load conversation history</AlertDescription>
                  </Alert>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No conversation history yet
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <Card
                      key={conv.id}
                      className="p-3 hover-elevate cursor-pointer"
                      onClick={() => handleSelectConversation(conv.id)}
                      data-testid={`conversation-${conv.id}`}
                    >
                      <div className="font-medium text-sm">{conv.title || "Untitled"}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(conv.createdAt).toLocaleDateString()}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            ) : !conversationId && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <Bot className="h-16 w-16 text-muted-foreground/50" />
                <div>
                  <h3 className="text-lg font-semibold">Welcome to Inspect360 AI Assistant</h3>
                  <p className="text-sm text-muted-foreground mt-2">
                    Ask me about inspections, compliance, properties, or any features
                  </p>
                </div>
              </div>
            ) : messagesError ? (
              <Alert variant="destructive" className="m-4">
                <AlertDescription>Failed to load messages. Please try again.</AlertDescription>
              </Alert>
            ) : isLoadingMessages ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    data-testid={`message-${msg.role}-${msg.id}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Bot className="h-5 w-5 text-primary" />
                        </div>
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <ChatMarkdown content={msg.content} />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                      <p className="text-xs mt-1 opacity-70">
                        {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ''}
                      </p>
                    </div>
                    {msg.role === 'user' && (
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                          <User className="h-5 w-5 text-primary-foreground" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {sendMessageMutation.isPending && (
                  <div className="flex gap-3 justify-start">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <div className="bg-muted rounded-lg px-4 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <div className="border-t p-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask a question..."
                disabled={sendMessageMutation.isPending}
                data-testid="input-message"
              />
              <Button
                type="submit"
                disabled={!message.trim() || sendMessageMutation.isPending}
                data-testid="button-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
