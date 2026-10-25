// Refresh all currently visible pages without collapsing a paginated list.
export async function fetchVisibleApplications(fetchPage, visibleCount = 20) {
  const wanted = Math.max(20, visibleCount);
  const items = [];
  let total = 0;
  do {
    const page = await fetchPage({ limit: Math.min(100, wanted - items.length), offset: items.length });
    total = page.total;
    items.push(...page.items);
    if (!page.items.length) break;
  } while (items.length < wanted && items.length < total);
  return { items, total };
}
