import { useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import type { CareTeam } from "./useCareTeam";
import { incidentStatus } from "./incidents";
import { suiteRecords, type SuiteId } from "./suiteRecords";
import { proposedResponder, suiteReport } from "./suiteReport";
import { routeLevels } from "./routeRisk";
import { eventVoiceMessage, incidentVoiceMessage, stationAnnouncement } from "./stationAnnouncement";
import IncidentDesk from "./IncidentDesk";
import DispatchResponse from "./DispatchResponse";
import PanoramicAssistant from "./PanoramicAssistant";
import StationVoice, { StationVoiceSettings } from "./StationVoice";
import { activityTime } from "./activityTimeline";
import { useActivitySequence } from "./useActivitySequence";
import "./suite-ai.css";

type Tab = "station" | "activity" | "report" | "chat";
export default function SuiteAI({ room, team, selectedId, onSelect, onSignIn, processing, active }: {
  room: SuiteId; team: CareTeam; selectedId: string; onSelect: (id: string, room: string) => void; onSignIn: () => void; processing: boolean; active: boolean;
}) {
  const records = suiteRecords(room, team.incidents, team.events);
  const current = records.incidents.find(i => i.id === selectedId) ?? records.open[0] ?? records.incidents[0];
  const [tab, setTab] = useState<Tab>("station");
  const visibleEvents = useActivitySequence(`${team.facilityId}:${room}`, records.events, tab === "activity" && active);
  const suggested = current ? proposedResponder(current, team.members, team.incidents, team.clock) : null;
  const voiceMessage = current ? incidentVoiceMessage(room, current) : null;
  const download = () => {
    const url = URL.createObjectURL(new Blob([suiteReport(room, team.incidents, team.events, team.members)], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `panoramic-suite-${room}-report.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="suite-ai card" aria-label={`Panoramic AI · Suite ${room}`}>
    <header className="suite-ai-heading"><div><h2>Panoramic AI</h2></div><span>Suite {room}</span></header>
    <StationVoiceSettings />
    <ol className="suite-ai-flow" aria-label="Hazard response sequence">
      <li data-complete>Monitor</li><li data-complete={!!current || processing}>Detect</li><li data-complete={!!current}>Alert</li><li data-complete={!!current?.assigned_to}>Response</li>
    </ol>
    <nav className="suite-ai-tabs" aria-label={`Suite ${room} AI sections`}>
      {([["station", "Station response"], ["activity", "Activity"], ["report", "Suite report"], ["chat", "Chat"]] as const).map(([value, label]) => <button key={value} aria-current={tab === value ? "page" : undefined} onClick={() => setTab(value)}>{label}</button>)}
    </nav>
    <div className="suite-ai-content">
      {tab === "station" && <>
        <div className="suite-ai-section-title"><h3>Active concerns</h3><span className="small-count">{records.open.length}</span></div>
        {records.open.map(i => <button key={i.id} className="suite-concern" aria-pressed={current?.id === i.id} onClick={() => onSelect(i.id, i.room)}><span className="route-badge" style={{ background: routeLevels[i.priority].color, color: routeLevels[i.priority].ink }}>{routeLevels[i.priority].rank ? `L${routeLevels[i.priority].rank}` : "?"}</span><span><b>{i.zone}</b><small>{incidentStatus(i)}</small></span><ArrowRight size={14} /></button>)}
        {!current && <div className="station-response-line"><p><strong>[Panoramic to supervision station]</strong> {processing ? "A hazard event was received. Measuring its position against the marked route before opening a concern." : `No hazard event for Suite ${room} yet. Monitoring comes first; a detected hazard triggers route assessment and a station request.`}</p><StationVoice message={{ key: `${room}:monitoring:${processing}`, announcement: { room, priority: "unassessed", update: processing ? "detected" : "monitoring" } }} /></div>}
        {current && <>
          <div className="station-response-line"><p><strong>[Panoramic to supervision station]</strong> {voiceMessage ? stationAnnouncement(room, voiceMessage.announcement.priority, voiceMessage.announcement.update, voiceMessage.announcement.zone).replace(/^Panoramic to supervision station\. /, "") : incidentStatus(current)}</p><StationVoice message={voiceMessage} /></div>
          <p><strong>[Review]</strong> {current.observation.scene.brief}</p>
          {suggested && <p className="station-proposal"><strong>[Propose]</strong> {suggested.display_name}<br /><small>Available, qualified flag, response order {suggested.response_order}. Not clinical triage or measured distance.</small></p>}
          <DispatchResponse key={current.id} team={team} incident={current} preferred={suggested?.user_id} />
          {current.phase === "flagged" && team.me?.role !== "coordinator" && <p>Waiting for a supervisor to approve the proposed assignment.</p>}
          <button className="secondary full" onClick={() => setTab("report")}>Open response & sign-offs <ArrowRight size={14} /></button>
        </>}
      </>}
      {tab === "activity" && <section aria-label={`Suite ${room} activity`}><h3>Activity</h3><div role="log" aria-live="polite" aria-relevant="additions text">{records.events.length ? <ol className="suite-ai-activity">{visibleEvents.map(e => <li key={e.id}><header><time dateTime={e.created_at}>[{activityTime(e.created_at)}]</time><StationVoice message={eventVoiceMessage(room, e, records.incidents)} /></header><p>{e.detail}</p></li>)}</ol> : <p>No activity yet for Suite {room}.</p>}</div></section>}
      {tab === "report" && <section aria-label={`Suite ${room} report`}><div className="suite-ai-section-title"><h3>Suite report</h3><button className="text-button" onClick={download}><Download size={14} /> Export</button></div>
        <p>{records.open.length} open · {records.incidents.filter(i => i.phase === "resolved").length} closed</p>
        {!!records.incidents.length && <label className="team-field">Response record<select value={current?.id ?? ""} onChange={e => { onSelect(e.target.value, room); }}>
          {records.incidents.map(i => <option key={i.id} value={i.id}>{i.zone} · {incidentStatus(i)} · {new Date(i.created_at).toLocaleTimeString()}</option>)}
        </select></label>}
        {current ? <IncidentDesk key={current.id} team={team} incident={current} /> : <p>No response records for Suite {room}. Missing data does not mean the room is safe.</p>}
      </section>}
      {tab === "chat" && <PanoramicAssistant key={`${team.userId}:${team.facilityId}:${room}`} room={room} team={team} selectedId={current?.id ?? ""} onSelect={(id, selectedRoom) => { onSelect(id, selectedRoom); setTab("report"); }} onSignIn={onSignIn} />}
    </div>
  </section>;
}
