// Helpers shared by every multi-select filter.
//
// The array-of-selected-values shape replaced a single <select> on each list
// page. Empty means "not filtering", never "match nothing" — a manager who has
// just unticked the last box is asking to stop filtering, not asking to see
// zero rows. Every predicate in the app has to read it the same way, so it
// lives here rather than being re-derived per page.

/** Add or remove `value`, then hand the new array to the setter. */
export function toggle(
  current: string[],
  set: (next: string[]) => void,
  value: string,
): void {
  set(current.includes(value) ? current.filter((v) => v !== value) : [...current, value])
}

/** Does `value` pass this filter? Empty selection passes everything. */
export function passes(selected: string[], value: string | null | undefined): boolean {
  return selected.length === 0 || (value != null && selected.includes(value))
}

/** True when the selection is exactly this set — for "is this preset active?". */
export function isExactly(selected: string[], preset: string[]): boolean {
  return selected.length === preset.length && preset.every((v) => selected.includes(v))
}
