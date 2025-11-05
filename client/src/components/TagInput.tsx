import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Plus, Tag as TagIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Tag } from "@shared/schema";

interface TagInputProps {
  selectedTags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
  placeholder?: string;
}

export function TagInput({ selectedTags, onTagsChange, placeholder = "Add tags..." }: TagInputProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/tags", { name, color: getRandomColor() });
      return res.json();
    },
    onSuccess: async () => {
      // Wait for the tags query to refetch so new tag appears in dropdown
      await queryClient.refetchQueries({ queryKey: ["/api/tags"] });
    },
  });

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    const tag = await createTagMutation.mutateAsync(newTagName.trim()) as Tag;
    onTagsChange([...selectedTags, tag]);
    setNewTagName("");
    setSearchQuery("");
    setOpen(false); // Close popover after creating tag
  };

  const handleAddTag = (tag: Tag) => {
    if (!selectedTags.find(t => t.id === tag.id)) {
      onTagsChange([...selectedTags, tag]);
    }
    setSearchQuery("");
  };

  const handleRemoveTag = (tagId: string) => {
    onTagsChange(selectedTags.filter(t => t.id !== tagId));
  };

  const filteredTags = allTags.filter(tag =>
    !selectedTags.find(t => t.id === tag.id) &&
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const showCreateOption = searchQuery.trim() && !allTags.find(t =>
    t.name.toLowerCase() === searchQuery.toLowerCase()
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {selectedTags.map(tag => (
          <Badge
            key={tag.id}
            variant="secondary"
            className="gap-1"
            style={{ backgroundColor: tag.color || undefined }}
            data-testid={`tag-badge-${tag.id}`}
          >
            <TagIcon className="h-3 w-3" />
            {tag.name}
            <button
              type="button"
              onClick={() => handleRemoveTag(tag.id)}
              className="ml-1 hover:bg-black/10 rounded-full"
              data-testid={`button-remove-tag-${tag.id}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 rounded-full"
              data-testid="button-add-tag"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="space-y-2">
              <Input
                ref={inputRef}
                placeholder={placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && showCreateOption) {
                    e.preventDefault();
                    setNewTagName(searchQuery);
                    handleCreateTag();
                  }
                }}
                data-testid="input-tag-search"
              />
              
              <div className="max-h-48 overflow-y-auto space-y-1">
                {showCreateOption && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewTagName(searchQuery);
                      handleCreateTag();
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover-elevate rounded-md"
                    data-testid="button-create-tag"
                  >
                    <Plus className="h-4 w-4" />
                    Create "{searchQuery}"
                  </button>
                )}
                
                {filteredTags.map(tag => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleAddTag(tag)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover-elevate rounded-md"
                    data-testid={`button-select-tag-${tag.id}`}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tag.color || '#6B7280' }}
                    />
                    {tag.name}
                  </button>
                ))}
                
                {!showCreateOption && filteredTags.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-2">
                    No tags found
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function getRandomColor(): string {
  const colors = [
    "#5AB5E8", // Sky blue (primary)
    "#3B82F6", // Blue
    "#8B5CF6", // Purple
    "#EC4899", // Pink
    "#10B981", // Green
    "#F59E0B", // Amber
    "#EF4444", // Red
    "#6366F1", // Indigo
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
