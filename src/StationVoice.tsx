import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { LoaderCircle, Square, Volume2, X } from "lucide-react";
import { stationAnnouncement, type VoiceMessage } from "./stationAnnouncement";
import { createStationVoicePlayer, type VoicePlayback } from "./stationVoicePlayer";
import { createStationVoiceQueue, voiceAutoLimits } from "./stationVoiceQueue";

const connectionTest: VoiceMessage = { key: "station-connection-test", announcement: { room: "A101", priority: "unassessed", update: "recorded" } };
const VoiceContext = createContext<{ state: VoicePlayback; available: boolean; automatic: boolean; notice: string; prepared: (message: VoiceMessage) => boolean; configure: () => void; activate: (message: VoiceMessage) => void } | null>(null);

export function StationVoiceProvider({ supervisor, active, scope, messages, children }: { supervisor: boolean; active: boolean; scope: string; messages: VoiceMessage[]; children: ReactNode }) {
  const [ready, setReady] = useState(false), [checking, setChecking] = useState(true);
  const [code, setCode] = useState(""), [consent, setConsent] = useState(false);
  const [connection, setConnection] = useState("Checking voice connection…");
  const [selection, setSelection] = useState<VoiceMessage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false), [automatic, setAutomatic] = useState(false);
  const [autoStatus, setAutoStatus] = useState("");
  const [queue] = useState(createStationVoiceQueue);
  const messagesRef = useRef(messages); messagesRef.current = messages;
  const dialog = useRef<HTMLDialogElement>(null), headingId = useId();
  const [player] = useState(() => createStationVoicePlayer({ fetch: (...args) => fetch(...args), createAudio: () => new Audio(),
    createUrl: blob => URL.createObjectURL(blob), revokeUrl: url => URL.revokeObjectURL(url) }));
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot);
  useEffect(() => {
    const request = new AbortController();
    void fetch("/api/elevenlabs", { signal: request.signal }).then(r => r.json()).then(r => {
      if (request.signal.aborted) return;
      setReady(r.configured === true && r.updatesSupported === true); setChecking(false);
      setConnection(r.configured !== true ? "Station voice is not connected. Configure the voice server first."
        : r.updatesSupported !== true ? "The voice server needs the message-update release before these announcements can play."
        : "Sarah · ElevenLabs. New audio uses provider credits; replaying prepared audio does not.");
    }).catch(() => { if (!request.signal.aborted) { setChecking(false); setConnection("Station voice connection unavailable."); } });
    return () => { request.abort(); player.reset(); };
  }, [player]);
  // Suite navigation retains floor setup/cache; speech never follows the user into another suite.
  useEffect(() => { if (player.getSnapshot().phase === "playing") player.stop(); setSelection(null); }, [scope, player]);
  useEffect(() => { player.stopIfSuperseded(messages); }, [messages, player]);
  useEffect(() => { if (!active || !supervisor) { player.stop(); setSelection(null); setSettingsOpen(false); } }, [active, supervisor, player]);
  useEffect(() => { player.reset(); setAutomatic(false); }, [code, consent, player]);
  useEffect(() => {
    if (!automatic || !ready || !consent || code.length < 16 || !active || !supervisor || selection || settingsOpen) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || document.hidden || ["loading", "playing"].includes(player.getSnapshot().phase)) return;
      const message = queue.next(messagesRef.current, Date.now(), player.isPrepared);
      if (!message) {
        if (queue.exhausted()) { setAutoStatus("Automatic preparation reached this session's usage limit. Written responses remain available."); setAutomatic(false); }
        return;
      }
      setAutoStatus(`Preparing ${message.announcement.room} ${message.announcement.zone ?? "suite"} audio…`);
      const prepared = await player.prepare(message, { code, consent });
      if (cancelled) return;
      if (!prepared) { setAutomatic(false); setAutoStatus("Automatic preparation paused. Open voice settings to check access or quota; no automatic retry was made."); }
      else setAutoStatus("New station responses are prepared automatically. Click their speaker to listen.");
    };
    void tick(); const timer = setInterval(() => void tick(), 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [automatic, ready, consent, code, active, supervisor, selection, settingsOpen, player, queue]);
  useEffect(() => {
    if (selection || settingsOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selection, settingsOpen]);
  const activate = (message: VoiceMessage) => {
    if (!active || !supervisor) return;
    if (!ready || !consent || code.length < 16 || state.phase === "error") { player.stop(); setSelection(message); return; }
    void player.play(message, { code, consent });
  };
  const playSelection = () => {
    if (!active || !supervisor || !ready || !consent || code.length < 16 || !selection) return;
    const message = selection; setSelection(null); void player.play(message, { code, consent });
  };
  const closeSettings = () => { setSelection(null); setSettingsOpen(false); };
  return <VoiceContext.Provider value={{ state, available: active && supervisor, automatic, notice: autoStatus, prepared: player.isPrepared, configure: () => { player.stop(); setSettingsOpen(true); }, activate }}>
    {children}
    <dialog className="station-voice-dialog" ref={dialog} aria-labelledby={headingId} onCancel={closeSettings} onClose={closeSettings}>
      <header><h2 id={headingId}>Station voice settings</h2><button type="button" className="text-button" aria-label="Close voice setup" onClick={closeSettings}><X size={18} /></button></header>
      <p>{connection}</p>
      {selection && <p className="station-voice-preview">{stationAnnouncement(selection.announcement.room, selection.announcement.priority, selection.announcement.update, selection.announcement.zone)}</p>}
      <label className="team-field">Private voice access code<input type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} placeholder="Not your ElevenLabs API key" /></label>
      <label className="assistant-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Send fixed, non-sensitive station response text to ElevenLabs. No names or free-text care notes are sent.</span></label>
      <p className="muted">The API key is already kept on the server. This separate access code protects its credits. Setup and prepared audio stay in memory across all four suites until you reload or leave this workspace.</p>
      <p className="muted">Automatic mode prepares current and new station responses, one at a time, at most {voiceAutoLimits.clips} new clips / {voiceAutoLimits.characters.toLocaleString()} characters in this session. Repeated text reuses its clip. Provider quotas may stop generation earlier. Audio does not play or dispatch anyone automatically.</p>
      {autoStatus && <p role="status">{autoStatus}</p>}
      {state.key === connectionTest.key && <p role={state.phase === "error" ? "alert" : "status"}>{state.message}</p>}
      <p className="muted">Voice test text ({stationAnnouncement("A101", "unassessed", "recorded").length} characters): {stationAnnouncement("A101", "unassessed", "recorded")}</p>
      <button type="button" className="secondary full" disabled={checking || !ready || !supervisor || !active || !consent || code.length < 16} onClick={() => { setAutomatic(false); void player.play(connectionTest, { code, consent }); }}>{state.key === connectionTest.key && ["loading", "playing"].includes(state.phase) ? "Stop voice test" : "Test Sarah"}</button>
      {selection && <button type="button" className="secondary full" disabled={checking || !ready || !supervisor || !active || !consent || code.length < 16} onClick={playSelection}>Play this announcement</button>}
      <button type="button" className="primary full" disabled={checking || !ready || !supervisor || !active || !consent || code.length < 16} onClick={() => { player.stop(); setAutomatic(!automatic); closeSettings(); }}>{automatic ? "Pause automatic audio" : "Enable automatic audio"}</button>
      <button type="button" className="text-button" onClick={() => { player.reset(); setAutomatic(false); setCode(""); setConsent(false); setAutoStatus(""); }}>Forget voice access</button>
    </dialog>
  </VoiceContext.Provider>;
}

export function StationVoiceSettings() {
  const voice = useContext(VoiceContext);
  if (!voice?.available) return null;
  return <button type="button" className="station-voice-settings text-button" onClick={voice.configure} aria-label="Station voice settings" title={voice.notice}><Volume2 size={14} />{voice.automatic ? "Audio · automatic" : voice.notice ? "Audio paused · settings" : "Voice settings"}</button>;
}

// The message itself owns this single icon; there is no separate voice card.
export default function StationVoice({ message }: { message: VoiceMessage | null }) {
  const voice = useContext(VoiceContext);
  if (!voice || !message) return null;
  const selected = voice.state.key === message.key, phase = selected ? voice.state.phase : "idle";
  const playing = phase === "playing", loading = phase === "loading";
  const label = `${playing ? "Stop" : loading ? "Cancel" : "Play"} announcement for ${message.announcement.room} ${message.announcement.zone ?? "suite"} update`;
  return <span className="station-speaker-wrap">
    <button type="button" className="station-speaker" data-prepared={voice.prepared(message)} aria-label={label} title={voice.available ? `${label}${voice.prepared(message) ? " · Audio ready" : ""}` : "Voice playback is available to the supervision role"}
      aria-pressed={playing} disabled={!voice.available} onClick={() => voice.activate(message)}>
      {loading ? <LoaderCircle size={16} className="station-speaker-loading" /> : playing ? <Square size={14} /> : <Volume2 size={16} />}
    </button>
    {selected && voice.state.message && <span className={phase === "error" || (phase === "ready" && voice.state.message.includes("blocked")) ? "station-voice-feedback" : "station-voice-status"} role={phase === "error" ? "alert" : "status"}>{voice.state.message}</span>}
  </span>;
}
