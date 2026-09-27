import { stationAnnouncement, type VoiceMessage } from "./stationAnnouncement.ts";

export type VoicePlayback = { key: string; phase: "idle" | "loading" | "playing" | "ready" | "error"; message: string };
type PlayerAudio = Pick<HTMLAudioElement, "src" | "play" | "pause" | "onended" | "onerror">;
type Dependencies = { fetch: typeof fetch; createAudio: () => PlayerAudio; createUrl: (blob: Blob) => string; revokeUrl: (url: string) => void; cacheLimit?: number };

export const voiceText = (message: VoiceMessage) => {
  const a = message.announcement;
  return stationAnnouncement(a.room, a.priority, a.update, a.zone);
};

// One player per floor: preparation never starts playback, and matching text shares a clip.
export function createStationVoicePlayer(deps: Dependencies) {
  let state: VoicePlayback = { key: "", phase: "idle", message: "" };
  let generation = 0, controller: AbortController | null = null, audio: PlayerAudio | null = null;
  let preparingOnly = false;
  const listeners = new Set<() => void>(), cache = new Map<string, string>();
  const clips = new Map<string, Blob>();
  const set = (next: VoicePlayback) => { state = next; listeners.forEach(listener => listener()); };
  const stop = () => {
    generation++; controller?.abort(); controller = null; preparingOnly = false;
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.src = ""; audio = null; }
    set({ key: "", phase: "idle", message: "" });
  };
  const controls = {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    stop,
    stopPlayback() { if (!preparingOnly && ["loading", "playing"].includes(state.phase)) stop(); },
    stopIfSuperseded(messages: VoiceMessage[]) {
      // Finish and cache an in-flight preparation, even when the response advances.
      // Only audible, outdated speech must stop immediately.
      if (!preparingOnly && state.key.startsWith("current:") && !messages.some(message => message.key === state.key)) stop();
    },
    reset() { stop(); cache.forEach(deps.revokeUrl); cache.clear(); clips.clear(); },
    clip: (message: VoiceMessage) => clips.get(voiceText(message)),
    restore(text: string, blob: Blob) {
      if (cache.has(text) || cache.size >= (deps.cacheLimit ?? 12)) return;
      cache.set(text, deps.createUrl(blob)); clips.set(text, blob);
      set({ ...state });
    },
    isPrepared: (message: VoiceMessage) => cache.has(voiceText(message)),
    async prepare(message: VoiceMessage, credentials: { code: string; consent: boolean }) {
      if (["loading", "playing"].includes(state.phase)) return false;
      await controls.play(message, credentials, true);
      return cache.has(voiceText(message));
    },
    async play(message: VoiceMessage, credentials: { code: string; consent: boolean }, prepareOnly = false) {
      if (!cache.has(voiceText(message)) && (!credentials.consent || credentials.code.length < 16)) return;
      if (state.key === message.key && ["loading", "playing"].includes(state.phase)) { stop(); return; }
      stop();
      preparingOnly = prepareOnly;
      const version = generation, request = new AbortController(); controller = request;
      const a = message.announcement;
      const cacheKey = voiceText(message);
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
          source = deps.createUrl(blob); cache.set(cacheKey, source); clips.set(cacheKey, blob);
          if (cache.size > (deps.cacheLimit ?? 12)) { const oldest = cache.keys().next().value!; deps.revokeUrl(cache.get(oldest)!); cache.delete(oldest); clips.delete(oldest); }
        }
        if (version !== generation || request.signal.aborted) return;
        if (prepareOnly) { set({ key: message.key, phase: "ready", message: "Audio ready. Click the speaker to hear this update." }); return; }
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
  return controls;
}
