// Reveal at most one received row per step. This is presentation pacing only:
// never manufacture event timestamps, repeat an event, or delay response controls.
export function nextActivityIds(visible: string[], ordered: string[]): string[] {
  const available = new Set(ordered);
  const retained = visible.filter(id => available.has(id));
  const seen = new Set(retained);
  const next = ordered.find(id => !seen.has(id));
  if (next !== undefined) return [...retained, next];
  return retained.length === visible.length ? visible : retained;
}
