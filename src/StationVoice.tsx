import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { isAnnouncementPriority, stationAnnouncement } from "./stationAnnouncement";
import type { SharedIncident } from "./incidents";
import type { SuiteId } from "./suiteRecords";

export default function StationVoice({ room, incident, supervisor, active }: { room: SuiteId; incident?: SharedIncident; supervisor: boolean; active: boolean }) {
  const [ready, setReady] = useState(false), [enabled, setEnabled] = useState(false);
  const [code, setCode] = useState(""), [consent, setConsent] = useState(false);
  const [status, setStatus] = useState("Checking station voice…"), [audioUrl, setAudioUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const audio = useRef<HTMLAudioElement>(null), url = useRef(""), controller = useRef<AbortController | null>(null);
  const attempted = useRef(new Set<string>());
  const pending = incident?.room === room && incident.phase === "flagged" && isAnnouncementPriority(incident.priority) ? incident : undefined;
  const message = pending ? stationAnnouncement(room, pending.priority as Exclude<SharedIncident["priority"], "object">) : "No pending assignment announcement for this suite.";
  const eventKey = pending ? `${pending.id}:${pending.version}` : "";
  useEffect(() => {
    const request = new AbortController();
    void fetch("/api/elevenlabs", { signal: request.signal }).then(r => r.json()).then(r => { setReady(r.configured === true); setStatus(r.message); })
      .catch(() => { if (!request.signal.aborted) setStatus("Station voice connection unavailable."); });
    return () => { request.abort(); controller.current?.abort(); if (url.current) URL.revokeObjectURL(url.current); };
  }, []);
  // A changed/assigned incident or a different suite must never play an old request.
  useEffect(() => {
    controller.current?.abort(); audio.current?.pause(); setBusy(false); setAudioUrl("");
    if (url.current) { URL.revokeObjectURL(url.current); url.current = ""; }
  }, [eventKey, supervisor, consent, enabled, code, active]);
  const announce = async () => {
    if (!active || !ready || !supervisor || !consent || !code || !pending || busy) return;
    attempted.current.add(eventKey); setBusy(true); setAudioUrl(""); setStatus("Generating station announcement…");
    const request = new AbortController(); controller.current = request;
    try {
      const response = await fetch("/api/elevenlabs", { method: "POST", signal: request.signal,
        headers: { "Content-Type": "application/json", "x-voice-access-code": code },
        body: JSON.stringify({ room, priority: pending.priority, nonSensitiveConfirmed: consent }) });
      if (!response.ok) throw new Error((await response.json()).error || "Voice request failed.");
      const blob = await response.blob();
      if (request.signal.aborted) return;
      if (!blob.type.startsWith("audio/") || !blob.size) throw new Error("Voice response was not playable audio.");
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob); setAudioUrl(url.current);
      setStatus("Audio ready for this browser. Playback is not station acknowledgement.");
    } catch (error) { if (!request.signal.aborted) setStatus(error instanceof Error ? error.message : "Announcement failed. Read the written message."); }
    finally { if (!request.signal.aborted) setBusy(false); }
  };
  useEffect(() => {
    if (active && enabled && consent && code && ready && supervisor && eventKey && !attempted.current.has(eventKey)) void announce();
  }, [active, enabled, consent, code, ready, supervisor, eventKey]);
  useEffect(() => {
    if (active && audioUrl && enabled) void audio.current?.play().catch(() => setStatus("Your browser blocked automatic audio. Press Play below to hear it."));
  }, [active, audioUrl, enabled]);
  return <details className="station-voice">
    <summary><Volume2 size={15} /> Supervision station voice <span>{ready ? "ElevenLabs ready" : "Not connected"}</span></summary>
    <p className="station-voice-preview">{message}</p>
    <p className="muted">Plays on this browser’s speakers, not a remote station. Audio does not approve or dispatch a responder.</p>
    <label className="team-field">Private voice access code<input type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} placeholder="Not your ElevenLabs API key" /></label>
    <label className="assistant-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>These suite alerts contain no sensitive resident information. Send only the fixed announcement text shown here to ElevenLabs.</span></label>
    <label className="assistant-consent"><input type="checkbox" checked={enabled} disabled={!ready || !supervisor || !consent || !code} onChange={e => setEnabled(e.target.checked)} /><span>Automatically announce new pending assignments in this suite while this panel is open.</span></label>
    <button className="secondary full" disabled={!ready || !supervisor || !consent || !code || !pending || busy} onClick={() => void announce()}>Generate announcement</button>
    {audioUrl && <audio ref={audio} controls src={audioUrl} onEnded={() => setStatus("Played in this browser; supervision approval is still required.")} aria-label={`Suite ${room} station announcement`} />}
    <small role="status">{status}</small>
  </details>;
}
