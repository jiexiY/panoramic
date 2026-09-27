import { stationAnnouncement, type VoiceMessage } from "./stationAnnouncement.ts";

export type VoicePlayback = { key: string; phase: "idle" | "loading" | "playing" | "ready" | "error"; message: string };
type PlayerAudio = Pick<HTMLAudioElement, "src" | "play" | "pause" | "onended" | "onerror">;
type Dependencies = { fetch: typeof fetch; createAudio: () => PlayerAudio; createUrl: (blob: Blob) => string; revokeUrl: (url: string) => void };

// One player per suite panel: no overlapping speech, no automatic generation, bounded in-memory replay.
export function createStationVoicePlayer(deps: Dependencies) {
  let state: VoicePlayback = { key: "", phase: "idle", message: "" };
  let generation = 0, controller: AbortController | null = null, audio: PlayerAudio | null = null;
  const listeners = new Set<() => void>(), cache = new Map<string, string>();
  const set = (next: VoicePlayback) => { state = next; listeners.forEach(listener => listener()); };
  const stop = () => {
    generation++; controller?.abort(); controller = null;
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.src = ""; audio = null; }
    set({ key: "", phase: "idle", message: "" });
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    stop,
    reset() { stop(); cache.forEach(deps.revokeUrl); cache.clear(); },
    async play(message: VoiceMessage, credentials: { code: string; consent: boolean }) {
      if (!credentials.consent || credentials.code.length < 16) return;
      if (state.key === message.key && ["loading", "playing"].includes(state.phase)) { stop(); return; }
      stop();
      const version = generation, request = new AbortController(); controller = request;
      const a = message.announcement;
      const cacheKey = `${message.key}:${stationAnnouncement(a.room, a.priority, a.update, a.zone)}`;
      set({ key: message.key, phase: "loading", message: "Preparing announcement…" });
      try {
        let source = cache.get(cacheKey);
        if (!source) {
          const response = await deps.fetch("/api/elevenlabs", { method: "POST", signal: request.signal,
            headers: { "Content-Type": "application/json", "x-voice-access-code": credentials.code },
            body: JSON.stringify({ ...a, nonSensitiveConfirmed: true }) });
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(typeof body.error === "string" ? body.error : "Announcement unavailable. Read the written update.");
          }
          const blob = await response.blob();
          if (version !== generation || request.signal.aborted) return;
          if (!blob.type.startsWith("audio/") || !blob.size || blob.size > 5_000_000) throw new Error("Voice response was not playable audio.");
          source = deps.createUrl(blob); cache.set(cacheKey, source);
          if (cache.size > 12) { const oldest = cache.keys().next().value!; deps.revokeUrl(cache.get(oldest)!); cache.delete(oldest); }
        }
        if (version !== generation || request.signal.aborted) return;
        const player = deps.createAudio(); audio = player; player.src = source;
        player.onended = () => { if (version === generation) set({ key: message.key, phase: "ready", message: "Played in this browser. Click to replay without generating again." }); };
        player.onerror = () => { if (version === generation) set({ key: message.key, phase: "error", message: "Audio could not play. Check this browser's audio output." }); };
        try {
          await player.play();
          if (version === generation && state.phase === "loading") set({ key: message.key, phase: "playing", message: "Playing announcement. Click to stop." });
        } catch {
          if (version === generation) set({ key: message.key, phase: "ready", message: "Browser blocked playback. Click the speaker again to play the prepared audio." });
        }
      } catch (error) {
        if (version === generation && !request.signal.aborted) set({ key: message.key, phase: "error", message: error instanceof Error ? error.message : "Announcement failed. Read the written update." });
      }
    },
  };
}
