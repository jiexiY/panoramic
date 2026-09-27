import type { VoiceMessage } from "./stationAnnouncement.ts";
import { voiceText } from "./stationVoicePlayer.ts";

// Client safeguards, not a distributed provider quota. No timers, retries or credentials here.
export const voiceAutoLimits = { clips: 12, characters: 4000, intervalMs: 16_000 };
export function createStationVoiceQueue() {
  const pending = new Set<string>(), failed = new Set<string>();
  let count = 0, characters = 0, nextAt = 0, limited = false;
  return {
    next(messages: VoiceMessage[], now: number, prepared: (message: VoiceMessage) => boolean) {
      if (now < nextAt) return null;
      for (const message of messages) {
        const text = voiceText(message);
        if (pending.has(text) || failed.has(text) || prepared(message)) continue;
        if (count >= voiceAutoLimits.clips || characters + text.length > voiceAutoLimits.characters) { limited = true; return null; }
        pending.add(text); count++; characters += text.length; nextAt = now + voiceAutoLimits.intervalMs;
        return message;
      }
      return null;
    },
    finish(message: VoiceMessage, prepared: boolean) {
      const text = voiceText(message);
      pending.delete(text);
      if (!prepared) failed.add(text);
    },
    // Only an explicit resume permits another attempt; usage totals never reset.
    retryFailed() { failed.clear(); },
    exhausted: () => limited || count >= voiceAutoLimits.clips || characters >= voiceAutoLimits.characters,
    usage: () => ({ clips: count, characters }),
  };
}
