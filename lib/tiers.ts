/**
 * Returns the tier (1, 2, or 3) for a given account+category combination.
 * Defaults to 2 if not explicitly set.
 */
export function getTierForCategory(
  tierMap: Record<string, number> | null | unknown,
  category: string
): number {
  if (!tierMap || typeof tierMap !== "object" || Array.isArray(tierMap)) return 2
  const t = (tierMap as Record<string, number>)[category]
  return typeof t === "number" && [1, 2, 3].includes(t) ? t : 2
}

/**
 * Returns the best (lowest) tier an account has across all its categories.
 * Used for sorting/filtering when category="all".
 */
export function getBestTier(
  tierMap: Record<string, number> | null | unknown,
  categories: string[]
): number {
  if (!categories.length) return 2
  return Math.min(...categories.map((c) => getTierForCategory(tierMap, c)))
}
