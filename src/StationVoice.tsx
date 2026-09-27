import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { LoaderCircle, Square, Volume2, X } from "lucide-react";
import { stationAnnouncement, type VoiceMessage } from "./stationAnnouncement";
import { createStationVoicePlayer, type VoicePlayback } from "./stationVoicePlayer";

const VoiceContext = createContext<{ state: VoicePlayback; available: boolean; activate: (message: VoiceMessage) => void } | null>(null);

export function StationVoiceProvider({ supervisor, active, scope, children }: { supervisor: boolean; active: boolean; scope: string; children: ReactNode }) {
  const [ready, setReady] = useState(false), [checking, setChecking] = useState(true);
  const [code, setCode] = useState(""), [consent, setConsent] = useState(false);
  const [connection, setConnection] = useState("Checking voice connection…");
  const [selection, setSelection] = useState<VoiceMessage | null>(null);
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
  // Do not continue an old announcement after navigation, status changes, or revoked access.
  useEffect(() => { player.stop(); setSelection(null); }, [scope, active, supervisor, player]);
  useEffect(() => { player.reset(); }, [code, consent, player]);
  useEffect(() => {
    if (selection) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selection]);
  const activate = (message: VoiceMessage) => {
    if (!active || !supervisor) return;
    if (!ready || !consent || code.length < 16 || state.phase === "error") { player.stop(); setSelection(message); return; }
    void player.play(message, { code, consent });
  };
  const playSelection = () => {
    if (!active || !supervisor || !ready || !consent || code.length < 16 || !selection) return;
    const message = selection; setSelection(null); void player.play(message, { code, consent });
  };
  return <VoiceContext.Provider value={{ state, available: active && supervisor, activate }}>
    {children}
    <dialog className="station-voice-dialog" ref={dialog} aria-labelledby={headingId} onCancel={() => setSelection(null)} onClose={() => setSelection(null)}>
      <header><h2 id={headingId}>Play station announcement</h2><button type="button" className="text-button" aria-label="Close voice setup" onClick={() => setSelection(null)}><X size={18} /></button></header>
      <p>{connection}</p>
      {selection && <p className="station-voice-preview">{stationAnnouncement(selection.announcement.room, selection.announcement.priority, selection.announcement.update, selection.announcement.zone)}</p>}
      <label className="team-field">Private voice access code<input type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} placeholder="Not your ElevenLabs API key" /></label>
      <label className="assistant-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>Send this fixed, non-sensitive suite status summary to ElevenLabs. No names or free-text care notes are sent.</span></label>
      <p className="muted">Plays through this browser's speakers, not a remote PA system. Hearing an update does not approve or dispatch a responder. Setup lasts only while this suite panel is open.</p>
      <button type="button" className="primary full" disabled={checking || !ready || !supervisor || !active || !consent || code.length < 16} onClick={playSelection}>Play announcement</button>
    </dialog>
  </VoiceContext.Provider>;
}

// The message itself owns this single icon; there is no separate voice card.
export default function StationVoice({ message }: { message: VoiceMessage | null }) {
  const voice = useContext(VoiceContext);
  if (!voice || !message) return null;
  const selected = voice.state.key === message.key, phase = selected ? voice.state.phase : "idle";
  const playing = phase === "playing", loading = phase === "loading";
  const label = `${playing ? "Stop" : loading ? "Cancel" : "Play"} announcement for ${message.announcement.room} ${message.announcement.zone ?? "suite"} update`;
  return <span className="station-speaker-wrap">
    <button type="button" className="station-speaker" aria-label={label} title={voice.available ? label : "Voice playback is available to the supervision role"}
      aria-pressed={playing} disabled={!voice.available} onClick={() => voice.activate(message)}>
      {loading ? <LoaderCircle size={16} className="station-speaker-loading" /> : playing ? <Square size={14} /> : <Volume2 size={16} />}
    </button>
    {selected && voice.state.message && <span className={phase === "error" || (phase === "ready" && voice.state.message.includes("blocked")) ? "station-voice-feedback" : "station-voice-status"} role={phase === "error" ? "alert" : "status"}>{voice.state.message}</span>}
  </span>;
}
