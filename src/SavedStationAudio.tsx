import { useEffect, useRef, useState } from "react";
import type { VoiceMessage } from "./stationAnnouncement";
import { createStationVoicePlayer, voiceText } from "./stationVoicePlayer";
import { loadVoiceLibrary, saveVoiceClip, type SavedVoiceClip } from "./stationVoiceLibrary";

type Props = { player: ReturnType<typeof createStationVoicePlayer>; messages: VoiceMessage[]; code: string; consent: boolean; enabled: boolean; beforeStart: () => void };
export default function SavedStationAudio({ player, messages, code, consent, enabled, beforeStart }: Props) {
  const [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  const [saved, setSaved] = useState(0), [download, setDownload] = useState("");
  const controller = useRef<AbortController | null>(null), downloadRef = useRef("");
  const characters = messages.reduce((total, m) => total + voiceText(m).length, 0);
  useEffect(() => {
    let cancelled = false;
    void loadVoiceLibrary().then(clips => { if (!cancelled) { clips.forEach(c => player.restore(c.text, c.audio)); setSaved(clips.length); } }).catch(() => { if (!cancelled) setStatus("Saved audio storage is unavailable in this browser."); });
    return () => { cancelled = true; controller.current?.abort(); };
  }, [player, code, consent, enabled]);
  useEffect(() => () => { URL.revokeObjectURL(downloadRef.current); }, []);
  const createDownload = async (clips: SavedVoiceClip[]) => {
    const entries = await Promise.all(clips.map(async c => {
      const bytes = new Uint8Array(await c.audio.arrayBuffer());
      let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
      return { text: c.text, announcement: c.announcement, createdAt: c.createdAt, mimeType: c.audio.type, audioBase64: btoa(binary) };
    }));
    URL.revokeObjectURL(downloadRef.current);
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, voice: "Sarah", provider: "ElevenLabs", scope: "Fixed demo announcements only; no credentials or resident notes", clips: entries }, null, 2)], { type: "application/json" }));
    downloadRef.current = url; setDownload(url);
  };
  const prepare = async () => {
    if (busy || !enabled || !consent || code.length < 16 || messages.length > 32 || characters > 8000) return;
    beforeStart(); player.stop(); const run = new AbortController(); controller.current = run; setBusy(true);
    const batch = messages.slice(); let generated = 0;
    try {
      for (const [index, message] of batch.entries()) {
        if (run.signal.aborted) break;
        if (!player.isPrepared(message) && generated) await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, 16_000); run.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
        });
        if (run.signal.aborted) break;
        setStatus(`Preparing and saving ${index + 1} of ${batch.length} announcements…`);
        if (!player.isPrepared(message)) {
          generated++;
          if (!await player.prepare(message, { code, consent })) throw new Error(player.getSnapshot().message || "Audio preparation failed.");
        }
        if (run.signal.aborted) break;
        const audio = player.clip(message); if (!audio) throw new Error("The prepared audio is unavailable.");
        await saveVoiceClip({ text: voiceText(message), audio, announcement: message.announcement, createdAt: new Date().toISOString() });
        setSaved((await loadVoiceLibrary()).length);
      }
      const clips = await loadVoiceLibrary(); await createDownload(clips);
      setStatus(run.signal.aborted ? `Stopped. ${clips.length} saved clips remain reusable.` : `Saved ${batch.length} announcements in this browser. Reloads reuse them without generating again.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Audio preparation failed. No automatic retry was made."); }
    finally { setBusy(false); }
  };
  return <section className="station-audio-library" aria-label="Saved Sarah demo audio">
    <h3>Reusable demo audio</h3>
    <p>{messages.length} current announcements · {characters.toLocaleString()} characters · {saved} saved clips</p>
    <p className="muted">Generate once using ElevenLabs credits. Only these fixed demo texts and audio are saved in this browser—not access codes, API keys or resident notes. Browser data clearing removes the saved library.</p>
    {status && <p role="status">{status}</p>}
    <button type="button" className="secondary full" disabled={busy || !enabled || !consent || code.length < 16 || messages.length > 32 || characters > 8000} onClick={() => { void prepare(); }}>Generate & save current announcements</button>
    {busy && <button type="button" className="text-button" onClick={() => { controller.current?.abort(); player.stop(); }}>Stop library preparation</button>}
    {!busy && saved > 0 && <button type="button" className="text-button" onClick={() => { void loadVoiceLibrary().then(createDownload).catch(() => setStatus("Audio library export failed.")); }}>Export saved audio library</button>}
    {download && <a href={download} download="panoramic-sarah-demo-audio.json">Download audio and transcripts</a>}
  </section>;
}
