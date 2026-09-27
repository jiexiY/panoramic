import type { VoiceMessage } from "./stationAnnouncement.ts";
import { voiceText } from "./stationVoicePlayer.ts";

// Client safeguards, not a distributed provider quota. No timers, retries or credentials here.
export const voiceAutoLimits = { clips: 12, characters: 4000, intervalMs: 16_000 };
export function createStationVoiceQueue() {
  const seen = new Set<string>();
  let count = 0, characters = 0, nextAt = 0, limited = false;
  return {
    next(messages: VoiceMessage[], now: number, prepared: (message: VoiceMessage) => boolean) {
      if (now < nextAt) return null;
      for (const message of messages) {
        const text = voiceText(message);
        if (seen.has(text)) continue;
        if (prepared(message)) { seen.add(text); continue; }
        if (count >= voiceAutoLimits.clips || characters + text.length > voiceAutoLimits.characters) { limited = true; return null; }
        seen.add(text); count++; characters += text.length; nextAt = now + voiceAutoLimits.intervalMs;
        return message;
      }
      return null;
    },
    exhausted: () => limited || count >= voiceAutoLimits.clips || characters >= voiceAutoLimits.characters,
    usage: () => ({ clips: count, characters }),
  };
}
