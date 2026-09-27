import { lazy, Suspense, useEffect, useReducer, useRef, useState } from "react";
import {
  ArrowRight,
  Eye,
} from "lucide-react";
import { suiteIds, suiteRecords, isSuiteId, type SuiteId } from "./suiteRecords";
import SiteLink, { type Navigate } from "./SiteLink";
import { suitePath } from "./routes";
import { routeLevels, type RoutePriority } from "./routeRisk";
import type { CareTeam } from "./useCareTeam";
import { incidentStatus, noHazardVisible } from "./incidents";
import PanoramicAssistant from "./PanoramicAssistant";
import IncidentDesk from "./IncidentDesk";
import RoomMonitoring from "./RoomMonitoring";
import ObservationStatus from "./ObservationStatus";
import { initialRecording, recordingIsOn, recordingReducer } from "./recordingObservation";
import "./facility.css";
import "./room-monitoring.css";

const FacilityMap = lazy(() => import("./FacilityMap"));
type Props = {
  suite?: SuiteId;
  navigate: Navigate;
  active: boolean;
  workflowScanning: boolean;
  onStopWorkflow: () => void;
  onMonitorFrame: (value: "hazard" | "clear" | "unknown") => void;
  team: CareTeam;
  onSignIn: () => void;
};
export default function FacilityWorkspace({
  suite,
  navigate,
  active,
  workflowScanning,
  onStopWorkflow,
  onMonitorFrame,
  team,
  onSignIn,
}: Props) {
  const monitoringRoom = suite ?? "A101";
  const selectSuite = (room: string | null) => { if (isSuiteId(room)) navigate(suitePath(room)); };
  const [selectedId, setSelectedId] = useState("");
  const [recording, recordingAction] = useReducer(recordingReducer, initialRecording);
  const incidentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setSelectedId(""); if (team.mode !== "playback") recordingAction({ type: "close" }); }, [team.facilityId, team.mode, monitoringRoom]);
  const roomRecords = suiteRecords(monitoringRoom, team.incidents, team.events);
  const { open, events, incidents } = roomRecords;
  const current =
    incidents.find((i) => i.id === selectedId) ??
    open[0] ??
    incidents[0];
  const priorities: Record<string, RoutePriority> = {};
  for (const i of team.incidents.filter(i => i.phase !== "resolved")) {
    if (
      !(i.room in priorities) ||
      routeLevels[i.priority].rank > routeLevels[priorities[i.room]].rank
    )
      priorities[i.room] = i.priority;
  }
  const recordingPending = active && monitoringRoom === "A101" && recording.mode === "loading";
  const observationOn = active && monitoringRoom === "A101" && (workflowScanning || recordingIsOn(recording, active, monitoringRoom));
  useEffect(() => { if (!active) { recordingAction({ type: "pause" }); onStopWorkflow(); } }, [active]);
  useEffect(() => { if (monitoringRoom !== "A101") { recordingAction({ type: "close" }); onStopWorkflow(); } }, [monitoringRoom]);
  const roomOpen = open;
  const roomLatest = incidents[0];
  const toggleObservation = () => {
    if (monitoringRoom !== "A101") return;
    if (observationOn || recordingPending) {
      recordingAction({ type: "pause" });
      if (workflowScanning) onStopWorkflow();
    } else {
      recordingAction({ type: "play" });
    }
  };
  const showIncident = (id: string, room: string) => {
    if (room !== monitoringRoom || !incidents.some(i => i.id === id)) return;
    setSelectedId(id);
    requestAnimationFrame(() =>
      incidentRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      }),
    );
  };
  return (
    <div className="facility-page">
      <section className="page-heading facility-heading">
        <h1>{suite ? `Suite ${suite}` : "Resident Floor"}</h1>
      </section>
      {team.facility && team.stale && (
        <div className="notice error" role="alert">
          Connection needs attention. The information below may be out of date.
        </div>
      )}
      {incidents.filter(i => i.phase === "dispatched" && i.assigned_to === team.userId).map(i => <div key={i.id} className="assigned-banner" role="status"><div><b>Response requested · {i.room}</b><span>{i.zone} · waiting for your acceptance</span></div><button className="primary" onClick={() => showIncident(i.id, i.room)}>Review request <ArrowRight size={15} /></button></div>)}
      <div className="facility-grid">
        <div className="facility-main">
          <section className="facility-map-panel">
            <div className="facility-panel-header">
              <ObservationStatus on={observationOn} pending={recordingPending} onToggle={monitoringRoom === "A101" ? toggleObservation : undefined} />
            </div>
            <Suspense
              fallback={
                <div className="facility-map-loading">
                  Opening Resident Floor…
                </div>
              }
            >
              <FacilityMap
                selected={monitoringRoom}
                alert={false}
                roomPriorities={priorities}
                showRoute={false}
                onSelect={selectSuite}
                active={active}
              />
            </Suspense>
          </section>
          <div className="room-monitor-workspace">
            <nav className="room-monitor-selector" aria-label="Room monitoring selection">
              {suiteIds.map(id => <SiteLink key={id} to={suitePath(id)} navigate={navigate} aria-current={monitoringRoom === id ? "page" : undefined}>Suite {id}</SiteLink>)}
            </nav>
            <RoomMonitoring key={monitoringRoom} room={monitoringRoom}
              priority={priorities[monitoringRoom] ?? "unassessed"} active={active} workflowScanning={workflowScanning}
              recording={recording} onRecordingAction={action => {
                recordingAction(action);
                if (action.type === "pause" || action.type === "close") onStopWorkflow();
                if (action.type === "loaded" && action.version === recording.version && recording.mode === "loading" && active && monitoringRoom === "A101") onMonitorFrame("hazard");
                if (action.type === "failed" && action.version === recording.version) onMonitorFrame("unknown");
              }}
              clearVisible={roomOpen.length > 0 && roomOpen.every(noHazardVisible)}
              closed={!roomOpen.length && !!roomLatest?.nursing_checked_by}
              canReview={team.mode === "playback" && open.length > 0}
              onClearFrame={() => onMonitorFrame("clear")} />
          </div>
          <div className="facility-bottom-grid" role="region" aria-label={`Suite ${monitoringRoom} follow-up`}>
            <section className="facility-card">
              <div className="facility-card-heading">
                <h2>Active concerns</h2>
                <span className="small-count">{open.length}</span>
              </div>
              {open.length ? (
                open.map((i) => (
                  <button
                    key={i.id}
                    className={`queue-row ${i.escalated_at ? "escalated" : ""}`}
                    onClick={() => showIncident(i.id, i.room)}
                  >
                    <span
                      className="alert-rank"
                      style={{
                        background: routeLevels[i.priority].color,
                        color: routeLevels[i.priority].ink,
                      }}
                    >
                      {routeLevels[i.priority].rank
                        ? `L${routeLevels[i.priority].rank}`
                        : "?"}
                    </span>
                    <span>
                      <b>
                        {i.room} · {i.zone}
                      </b>
                      <small>
                        {i.escalated_at
                          ? "Escalated · coordinator attention"
                          : incidentStatus(i)}
                      </small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                ))
              ) : (
                <div className="facility-empty">No open concerns for Suite {monitoringRoom}</div>
              )}
            </section>
            <section className="facility-card">
              <div className="facility-card-heading">
                <h2>Activity</h2>
                <Eye size={16} />
              </div>
              {events.length ? (
                <ol className="facility-activity">
                  {events
                    .slice(-8)
                    .reverse()
                    .map((e) => (
                      <li key={e.id}>
                        <time>
                          {new Date(e.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                        <span>{e.detail}</span>
                      </li>
                    ))}
                </ol>
              ) : (
                <div className="facility-empty">No activity yet for Suite {monitoringRoom}</div>
              )}
            </section>
          </div>
          {current && (
            <div ref={incidentRef}>
              <div className="incident-picker">
                {incidents.map((i) => (
                  <button
                    key={i.id}
                    aria-pressed={i.id === current.id}
                    onClick={() => showIncident(i.id, i.room)}
                  >
                    {i.room} · {i.phase === "resolved" ? "Recorded" : i.zone}
                  </button>
                ))}
              </div>
              <IncidentDesk key={current.id} team={team} incident={current} />
            </div>
          )}
        </div>
        <aside className="facility-sidebar" aria-label="Panoramic assistant">
          <PanoramicAssistant key={`${team.userId}:${team.facilityId}:${monitoringRoom}`} room={monitoringRoom} team={team} selectedId={current?.id ?? ""} onSelect={showIncident} onSignIn={onSignIn} />
        </aside>
      </div>
    </div>
  );
}
