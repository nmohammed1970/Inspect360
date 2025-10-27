import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, FileText, Plus, AlertCircle } from "lucide-react";

interface MessageTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
}

interface BroadcastDialogProps {
  blockId: string;
  blockName: string;
  blockAddress: string;
  tenantCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BroadcastDialog({
  blockId,
  blockName,
  blockAddress,
  tenantCount,
  open,
  onOpenChange,
}: BroadcastDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"template" | "custom">("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewBody, setPreviewBody] = useState("");

  const { data: templates = [], isLoading: templatesLoading } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/message-templates"],
    enabled: open,
  });

  const broadcastMutation = useMutation({
    mutationFn: async (data: { templateId?: string; subject?: string; body?: string }) => {
      return apiRequest(`/api/blocks/${blockId}/broadcast`, "POST", data);
    },
    onSuccess: (result: any) => {
      const successCount = result.results?.filter((r: any) => r.success).length || 0;
      const failureCount = result.results?.filter((r: any) => !r.success).length || 0;

      toast({
        title: "Broadcast sent",
        description: `Successfully sent to ${successCount} tenant${successCount !== 1 ? 's' : ''}${failureCount > 0 ? `. Failed to send to ${failureCount}.` : ''}`,
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send broadcast",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setActiveTab("template");
    setSelectedTemplateId("");
    setCustomSubject("");
    setCustomBody("");
    setPreviewSubject("");
    setPreviewBody("");
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      updatePreview(template.subject, template.body);
    }
  };

  const updatePreview = (subject: string, body: string) => {
    const variables: Record<string, string> = {
      '{block_name}': blockName,
      '{block_address}': blockAddress,
      '{tenant_name}': '[Tenant Name]',
      '{tenant_email}': '[tenant@example.com]',
      '{property_name}': '[Property Name]',
      '{sender_name}': '[Your Name]',
    };

    let previewSubj = subject;
    let previewBod = body;

    Object.entries(variables).forEach(([key, value]) => {
      previewSubj = previewSubj.replaceAll(key, value);
      previewBod = previewBod.replaceAll(key, value);
    });

    setPreviewSubject(previewSubj);
    setPreviewBody(previewBod);
  };

  const handleCustomSubjectChange = (value: string) => {
    setCustomSubject(value);
    updatePreview(value, customBody);
  };

  const handleCustomBodyChange = (value: string) => {
    setCustomBody(value);
    updatePreview(customSubject, value);
  };

  const handleSend = () => {
    if (activeTab === "template") {
      if (!selectedTemplateId) {
        toast({
          title: "Template required",
          description: "Please select a template to send",
          variant: "destructive",
        });
        return;
      }
      broadcastMutation.mutate({ templateId: selectedTemplateId });
    } else {
      if (!customSubject.trim() || !customBody.trim()) {
        toast({
          title: "Message required",
          description: "Please provide both subject and message body",
          variant: "destructive",
        });
        return;
      }
      broadcastMutation.mutate({ subject: customSubject, body: customBody });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Broadcast Message to Tenants
          </DialogTitle>
          <DialogDescription>
            Send a message to all {tenantCount} active tenant{tenantCount !== 1 ? 's' : ''} in {blockName}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "template" | "custom")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="template" data-testid="tab-template">
              <FileText className="h-4 w-4 mr-2" />
              Use Template
            </TabsTrigger>
            <TabsTrigger value="custom" data-testid="tab-custom">
              <Plus className="h-4 w-4 mr-2" />
              Custom Message
            </TabsTrigger>
          </TabsList>

          <TabsContent value="template" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-select">Select Message Template</Label>
              {templatesLoading ? (
                <div className="text-sm text-muted-foreground">Loading templates...</div>
              ) : templates.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      No templates available. Switch to custom message or create templates from the settings.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                  <SelectTrigger id="template-select" data-testid="select-template">
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedTemplateId && (
              <Card className="bg-muted/50">
                <CardContent className="pt-6 space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Subject</Label>
                    <p className="text-sm font-medium" data-testid="text-template-subject">
                      {templates.find(t => t.id === selectedTemplateId)?.subject}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Message</Label>
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-template-body">
                      {templates.find(t => t.id === selectedTemplateId)?.body}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="custom" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custom-subject">Subject</Label>
              <Input
                id="custom-subject"
                placeholder="Enter message subject..."
                value={customSubject}
                onChange={(e) => handleCustomSubjectChange(e.target.value)}
                data-testid="input-custom-subject"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-body">Message</Label>
              <Textarea
                id="custom-body"
                placeholder="Enter your message here..."
                value={customBody}
                onChange={(e) => handleCustomBodyChange(e.target.value)}
                rows={8}
                data-testid="textarea-custom-body"
              />
            </div>

            <Card className="bg-muted/50 border-dashed">
              <CardContent className="pt-6">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="font-medium">Available Variables:</p>
                    <p>{'{tenant_name}'}, {'{tenant_email}'}, {'{block_name}'}, {'{block_address}'}, {'{property_name}'}, {'{sender_name}'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {(previewSubject || previewBody) && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Preview</Label>
            <Card className="border-primary/20">
              <CardContent className="pt-6 space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Subject</Label>
                  <p className="text-sm font-medium" data-testid="text-preview-subject">{previewSubject}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Message</Label>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-preview-body">{previewBody}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={broadcastMutation.isPending || tenantCount === 0}
            data-testid="button-send-broadcast"
          >
            {broadcastMutation.isPending ? (
              <>Sending...</>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send to {tenantCount} Tenant{tenantCount !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
