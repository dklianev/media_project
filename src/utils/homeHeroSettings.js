export function parseHeroProductionIds(rawValue) {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((value) => Number.parseInt(value, 10))
      .filter((value, index, array) => Number.isFinite(value) && value > 0 && array.indexOf(value) === index);
  } catch {
    return [];
  }
}

export function stringifyHeroProductionIds(ids) {
  return JSON.stringify(
    ids
      .map((value) => Number.parseInt(value, 10))
      .filter((value, index, array) => Number.isFinite(value) && value > 0 && array.indexOf(value) === index)
  );
}
