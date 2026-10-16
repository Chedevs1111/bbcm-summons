/**
 * Small display helpers.
 *
 * Money formatting deliberately lives in `@bbcm/schema` instead, so the Worker, the
 * PDF engine and the UI all share one definition — see `formatRands` there.
 */

/**
 * A count with its noun, pluralised.
 *
 *   count(1, 'field')              → '1 field'
 *   count(3, 'field')              → '3 fields'
 *   count(1, 'branch', 'branches') → '1 branch'
 *
 * Pass the plural explicitly whenever adding `s` would be wrong — "branchs" and
 * "entrys" are the failure mode this exists to prevent.
 */
export function count(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/**
 * The label under a stat tile, in the singular when the value is exactly one.
 *
 *   statLabel(1, 'Volumes', 'Volume')  → 'Volume'
 *   statLabel(3, 'Volumes', 'Volume')  → 'Volumes'
 *   statLabel(1, 'Confirmed')          → 'Confirmed'
 *
 * The plural is the default and the singular is opt-in, rather than the other way
 * round: plenty of tile labels are states rather than nouns — "Confirmed", "High
 * confidence", "Failed" — and appending an `s` to those would be worse than the bug
 * this fixes.
 */
export function statLabel(value: number, plural: string, singular?: string): string {
  return value === 1 && singular ? singular : plural;
}

/**
 * An inclusive page range, collapsed when it covers a single page.
 *
 *   pageRange(3, 7) → 'Pages 3–7'
 *   pageRange(3, 3) → 'Page 3'
 */
export function pageRange(first: number, last: number): string {
  return first === last ? `Page ${first}` : `Pages ${first}–${last}`;
}
