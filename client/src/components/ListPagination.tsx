import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const LIST_PAGE_SIZE = 24;

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function ListPagination({
  page,
  pageSize,
  total,
  isFetching = false,
  onPageChange,
  noun = "items",
}: {
  page: number;
  pageSize: number;
  total: number;
  isFetching?: boolean;
  onPageChange: (page: number) => void;
  noun?: string;
}) {
  if (total <= 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {isFetching
          ? `Loading ${noun}…`
          : `Showing ${start}–${end} of ${total}`}
      </p>
      {total > pageSize && (
        <div className="flex flex-wrap items-center gap-2 pr-36">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {safePage} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
