/** Pure capacity calculation; preserves order, never shrinks icons, no two-page limit. */
export function paginateDesktop<T>(
  items: T[],
  columns: number,
  height: number,
  rowHeight: number,
  gap: number,
  widgetHeight = 0,
): T[][] {
  const count = Math.max(1, Math.floor(columns));
  const cell = Math.max(1, rowHeight);
  const spacing = Math.max(0, gap);
  const rows = Math.max(1, Math.floor((height + spacing) / (cell + spacing)));
  const firstRows =
    widgetHeight > 0 ? Math.max(0, Math.floor((height - widgetHeight) / (cell + spacing))) : rows;
  const firstCapacity = firstRows * count;
  const pages = [items.slice(0, firstCapacity)];
  for (let start = firstCapacity; start < items.length; start += rows * count)
    pages.push(items.slice(start, start + rows * count));
  return pages;
}
