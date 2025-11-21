import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Filter, X, Tag as TagIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Tag } from "@shared/schema";

interface TagFilterProps {
  selectedTags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
  placeholder?: string;
}

export function TagFilter({ selectedTags, onTagsChange, placeholder = "Filter by tags..." }: TagFilterProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: allTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  const handleAddTag = (tag: Tag) => {
    if (!selectedTags.find(t => t.id === tag.id)) {
      onTagsChange([...selectedTags, tag]);
    }
    setSearchQuery("");
  };

  const handleRemoveTag = (tagId: string) => {
    onTagsChange(selectedTags.filter(t => t.id !== tagId));
  };

  const handleClearAll = () => {
    onTagsChange([]);
  };

  const filteredTags = allTags.filter(tag =>
    !selectedTags.find(t => t.id === tag.id) &&
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Selected tags */}
      {selectedTags.map(tag => (
        <Badge
          key={tag.id}
          variant="secondary"
          className="gap-1"
          style={{ backgroundColor: tag.color || undefined }}
          data-testid={`filter-tag-${tag.id}`}
        >
          <TagIcon className="h-3 w-3" />
          {tag.name}
          <button
            type="button"
            onClick={() => handleRemoveTag(tag.id)}
            className="ml-1 hover:bg-black/10 rounded-full"
            data-testid={`button-remove-filter-tag-${tag.id}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      {/* Add tag button */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            data-testid="button-add-tag-filter"
          >
            <Filter className="h-3 w-3 mr-1" />
            Add Filter
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="p-2 border-b">
            <Input
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8"
              data-testid="input-tag-filter-search"
            />
          </div>
          <ScrollArea className="h-48">
            <div className="p-2 space-y-1">
              {filteredTags.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  {searchQuery ? "No tags found" : "No more tags available"}
                </div>
              ) : (
                filteredTags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => handleAddTag(tag)}
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover-elevate flex items-center gap-2"
                    data-testid={`button-select-tag-${tag.id}`}
                  >
                    <TagIcon className="h-3 w-3" style={{ color: tag.color || undefined }} />
                    {tag.name}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Clear all button */}
      {selectedTags.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearAll}
          className="h-7 text-xs"
          data-testid="button-clear-all-filters"
        >
          Clear All
        </Button>
      )}
    </div>
  );
}
