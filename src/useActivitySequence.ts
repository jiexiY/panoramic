import { useEffect, useRef, useState } from "react";
import { nextActivityIds } from "./activitySequence";

export function useActivitySequence<T extends { id: string }>(scope: string, entries: T[], enabled = true): T[] {
  const latest = useRef(entries);
  latest.current = entries;
  // Separate cursors keep a suite switch from revealing another suite's rows or
  // replaying already-read history. The containing workspace owns this memory.
  const [revealed, setRevealed] = useState<Record<string, string[]>>({});
  useEffect(() => {
    if (!enabled) return;
    const advance = () => setRevealed(current => {
      const prior = current[scope] ?? [];
      const next = nextActivityIds(prior, latest.current.map(entry => entry.id));
      return next === prior ? current : { ...current, [scope]: next };
    });
    advance();
    const timer = setInterval(advance, 650);
    return () => clearInterval(timer);
  }, [scope, enabled]);
  const visible = new Set(revealed[scope] ?? []);
  return entries.filter(entry => visible.has(entry.id));
}
