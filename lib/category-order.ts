export function insertCategory(order: string[], source: string, target: string, side: "before" | "after"): string[] {
  if (source === target || !order.includes(source) || !order.includes(target)) return order;
  const next = order.filter((name) => name !== source);
  next.splice(next.indexOf(target) + (side === "after" ? 1 : 0), 0, source);
  return next;
}
