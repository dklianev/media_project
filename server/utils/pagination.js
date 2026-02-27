export function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parsePagination(query, defaults = {}) {
  const defaultPage = defaults.defaultPage ?? 1;
  const defaultPageSize = defaults.defaultPageSize ?? 20;
  const maxPageSize = defaults.maxPageSize ?? 100;

  const page = Math.max(1, toInt(query.page, defaultPage));
  const pageSize = Math.max(1, Math.min(maxPageSize, toInt(query.page_size, defaultPageSize)));
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset };
}

export function parseSort(query, sortMap, fallbackSortBy, fallbackDir = 'desc') {
  const requestedSortBy = String(query.sort_by || fallbackSortBy);
  const sortBy = Object.prototype.hasOwnProperty.call(sortMap, requestedSortBy)
    ? requestedSortBy
    : fallbackSortBy;
  const sortColumn = sortMap[sortBy];

  const rawDir = String(query.sort_dir || fallbackDir).toLowerCase();
  const sortDir = rawDir === 'asc' ? 'ASC' : 'DESC';

  return { sortBy, sortColumn, sortDir };
}

export function buildPageResult(items, page, pageSize, total, extra = {}) {
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
  return {
    items,
    page,
    page_size: pageSize,
    total,
    total_pages: totalPages,
    ...extra,
  };
}
