export function nextPageNumber(
  pageNumber: number,
  pageSize: number,
  itemCount: number,
  totalPages?: number,
): number | null {
  if (itemCount === 0) return null;
  const pages = totalPages && totalPages > 0
    ? totalPages
    : itemCount < pageSize
      ? pageNumber
      : pageNumber + 1;
  if (pageNumber >= pages) return null;
  return pageNumber + 1;
}
