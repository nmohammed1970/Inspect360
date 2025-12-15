import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Send, Loader2, X, Sparkles, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// Helper function to strip markdown formatting from AI responses
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '') // Remove headers (# ## ### etc)
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold **text**
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic *text*
    .replace(/__([^_]+)__/g, '$1') // Remove bold __text__
    .replace(/_([^_]+)_/g, '$1') // Remove italic _text_
    .replace(/~~([^~]+)~~/g, '$1') // Remove strikethrough
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links [text](url)
    .replace(/^\s*[-*+]\s+/gm, '- ') // Normalize bullet points
    .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers
    .trim();
}

export function IvyChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const sendMessageMutation = useMutation({
    mutationFn: async ({ message }: { message: string }) => {
      const response = await apiRequest("POST", "/api/ivy/chat", {
        message,
        history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      });
      return response.json();
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      }]);
      setMessage("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Message Failed",
        description: error.message || "Failed to send message to Ivy",
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

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: message.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    sendMessageMutation.mutate({ message: message.trim() });
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const IvyAvatar = () => (
    <Avatar className="h-10 w-10 border-2 border-primary/20">
      <AvatarFallback className="bg-gradient-to-br from-primary via-teal-400 to-emerald-400 text-white font-semibold text-sm">
        <Sparkles className="h-5 w-5" />
      </AvatarFallback>
    </Avatar>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl z-[99999] bg-gradient-to-br from-primary via-teal-500 to-emerald-500 hover:from-primary/90 hover:via-teal-500/90 hover:to-emerald-500/90 border-2 border-white/30 flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
        data-testid="button-ivy-open"
        style={{ minWidth: '56px', minHeight: '56px' }}
      >
        <Sparkles className="h-6 w-6 text-white" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl h-[600px] p-0 flex flex-col">
          <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-primary/5 via-teal-500/5 to-emerald-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <IvyAvatar />
                <div>
                  <DialogTitle className="flex items-center gap-2">
                    Ivy
                    <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary">AI Assistant</span>
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">Your BTR operations assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClearChat}
                    title="Clear chat"
                    data-testid="button-ivy-clear"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  data-testid="button-ivy-close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary via-teal-400 to-emerald-400 flex items-center justify-center">
                  <Sparkles className="h-10 w-10 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Hi, I'm Ivy!</h3>
                  <p className="text-muted-foreground mt-1 max-w-sm">
                    I can help you with inspections, compliance, tenants, maintenance, and more. Ask me anything about your BTR operations.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  {[
                    "What inspections are overdue?",
                    "Show me compliance status",
                    "How many maintenance requests are open?",
                    "List properties needing attention",
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      className="text-xs h-auto py-2 px-3 whitespace-normal text-left"
                      onClick={() => {
                        setMessage(suggestion);
                      }}
                      data-testid={`button-suggestion-${suggestion.slice(0, 20)}`}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    {msg.role === "assistant" ? (
                      <IvyAvatar />
                    ) : (
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-muted">You</AvatarFallback>
                      </Avatar>
                    )}
                    <Card
                      className={`p-3 max-w-[80%] ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.role === "assistant" ? stripMarkdown(msg.content) : msg.content}
                      </p>
                    </Card>
                  </div>
                ))}
                {sendMessageMutation.isPending && (
                  <div className="flex gap-3">
                    <IvyAvatar />
                    <Card className="p-3 bg-muted">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Ivy is thinking...</span>
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <div className="p-4 border-t">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                placeholder="Ask Ivy about your BTR operations..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sendMessageMutation.isPending}
                className="flex-1"
                data-testid="input-ivy-message"
              />
              <Button
                type="submit"
                disabled={!message.trim() || sendMessageMutation.isPending}
                className="bg-gradient-to-r from-primary to-teal-500"
                data-testid="button-ivy-send"
              >
                {sendMessageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
