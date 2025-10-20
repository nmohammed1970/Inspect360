import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building, Pencil, Trash2 } from "lucide-react";

interface Block {
  id: string;
  organizationId: string;
  name: string;
  address: string;
  notes?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export default function Blocks() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<Block | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();

  const { data: blocks = [], isLoading } = useQuery<Block[]>({
    queryKey: ["/api/blocks"],
  });

  const createBlockMutation = useMutation({
    mutationFn: async (data: { name: string; address: string; notes?: string }) => {
      return apiRequest("POST", "/api/blocks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      toast({ title: "Block created successfully" });
      handleCloseDialog();
    },
    onError: (error: any) => {
      console.error("Block creation error:", error);
      const message = error?.message || "Failed to create block";
      toast({ title: message, variant: "destructive" });
    },
  });

  const updateBlockMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; address: string; notes?: string }) => {
      return apiRequest("PATCH", `/api/blocks/${data.id}`, { 
        name: data.name, 
        address: data.address, 
        notes: data.notes 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      toast({ title: "Block updated successfully" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Failed to update block", variant: "destructive" });
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/blocks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      toast({ title: "Block deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete block", variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setEditingBlock(null);
    setName("");
    setAddress("");
    setNotes("");
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (block: Block) => {
    setEditingBlock(block);
    setName(block.name);
    setAddress(block.address);
    setNotes(block.notes || "");
    setIsCreateOpen(true);
  };

  const handleCloseDialog = () => {
    setIsCreateOpen(false);
    setEditingBlock(null);
    setName("");
    setAddress("");
    setNotes("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !address) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (editingBlock) {
      updateBlockMutation.mutate({ id: editingBlock.id, name, address, notes });
    } else {
      createBlockMutation.mutate({ name, address, notes });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this block? This cannot be undone.")) {
      deleteBlockMutation.mutate(id);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Blocks & Buildings</h1>
          <p className="text-muted-foreground">Manage your property complexes and building blocks</p>
        </div>
        <Button onClick={handleOpenCreate} data-testid="button-create-block">
          <Plus className="mr-2 h-4 w-4" />
          New Block
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading blocks...</div>
      ) : blocks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No blocks yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first building block to organize properties
            </p>
            <Button onClick={handleOpenCreate} data-testid="button-create-first-block">
              <Plus className="mr-2 h-4 w-4" />
              Create Block
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {blocks.map((block) => (
            <Card key={block.id} data-testid={`card-block-${block.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Building className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{block.name}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenEdit(block)}
                      data-testid={`button-edit-block-${block.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(block.id)}
                      data-testid={`button-delete-block-${block.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CardDescription className="line-clamp-2">{block.address}</CardDescription>
              </CardHeader>
              {block.notes && (
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">{block.notes}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBlock ? "Edit Block" : "Create New Block"}</DialogTitle>
            <DialogDescription>
              {editingBlock ? "Update the block details below" : "Add a new building block to your organization"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Block Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Block A, East Wing, Tower 1"
                data-testid="input-block-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address *</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main Street, City, Postcode"
                data-testid="input-block-address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional information about this block"
                rows={3}
                data-testid="input-block-notes"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCloseDialog} data-testid="button-cancel">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createBlockMutation.isPending || updateBlockMutation.isPending}
                data-testid="button-submit-block"
              >
                {editingBlock ? "Update" : "Create"} Block
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
