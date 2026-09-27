import { lazy, Suspense, useEffect, useReducer, useRef, useState } from "react";
import {
  ArrowRight,
  Eye,
} from "lucide-react";
import { suiteIds, type SpaceId } from "./facility";
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
  active: boolean;
  workflowScanning: boolean;
  onStopWorkflow: () => void;
  onMonitorFrame: (value: "hazard" | "clear" | "unknown") => void;
  team: CareTeam;
  onSignIn: () => void;
};
export default function FacilityWorkspace({
  active,
  workflowScanning,
  onStopWorkflow,
  onMonitorFrame,
  team,
  onSignIn,
}: Props) {
  const [selected, setSelected] = useState<SpaceId | null>("A101");
  const [selectedId, setSelectedId] = useState("");
  const [recording, recordingAction] = useReducer(recordingReducer, initialRecording);
  const incidentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setSelectedId(""); if (team.mode !== "playback") recordingAction({ type: "close" }); }, [team.facilityId, team.mode]);
  const open = team.incidents.filter((i) => i.phase !== "resolved");
  const current =
    team.incidents.find((i) => i.id === selectedId) ??
    open[0] ??
    team.incidents[0];
  const priorities: Record<string, RoutePriority> = {};
  for (const i of open) {
    if (
      !(i.room in priorities) ||
      routeLevels[i.priority].rank > routeLevels[priorities[i.room]].rank
    )
      priorities[i.room] = i.priority;
  }
  const monitoringRoom = selected && selected !== "supervision" ? selected : "A101";
  const recordingPending = active && monitoringRoom === "A101" && recording.mode === "loading";
  const observationOn = active && (workflowScanning || recordingIsOn(recording, active, monitoringRoom));
  useEffect(() => { if (!active) { recordingAction({ type: "pause" }); onStopWorkflow(); } }, [active]);
  useEffect(() => { if (monitoringRoom !== "A101") { recordingAction({ type: "close" }); onStopWorkflow(); } }, [monitoringRoom]);
  const roomOpen = open.filter(i => i.room === monitoringRoom);
  const roomLatest = team.incidents.find(i => i.room === monitoringRoom);
  const toggleObservation = () => {
    if (observationOn || recordingPending) {
      recordingAction({ type: "pause" });
      if (workflowScanning) onStopWorkflow();
    } else {
      setSelected("A101");
      recordingAction({ type: "play" });
    }
  };
  const showIncident = (id: string, room: string) => {
    setSelectedId(id);
    setSelected(room as SpaceId);
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
        <h1>Resident Floor</h1>
      </section>
      {team.facility && team.stale && (
        <div className="notice error" role="alert">
          Connection needs attention. The information below may be out of date.
        </div>
      )}
      {team.incidents.filter(i => i.phase === "dispatched" && i.assigned_to === team.userId).map(i => <div key={i.id} className="assigned-banner" role="status"><div><b>Response requested · {i.room}</b><span>{i.zone} · waiting for your acceptance</span></div><button className="primary" onClick={() => showIncident(i.id, i.room)}>Review request <ArrowRight size={15} /></button></div>)}
      <div className="facility-grid">
        <div className="facility-main">
          <section className="facility-map-panel">
            <div className="facility-panel-header">
              <ObservationStatus on={observationOn} pending={recordingPending} onToggle={toggleObservation} />
            </div>
            <Suspense
              fallback={
                <div className="facility-map-loading">
                  Opening Resident Floor…
                </div>
              }
            >
              <FacilityMap
                selected={selected}
                alert={false}
                roomPriorities={priorities}
                showRoute={false}
                onSelect={setSelected}
                active={active}
              />
            </Suspense>
          </section>
          <div className="room-monitor-workspace">
            <nav className="room-monitor-selector" aria-label="Room monitoring selection">
              {suiteIds.map(id => <button key={id} aria-pressed={monitoringRoom === id} onClick={() => setSelected(id)}>Suite {id}</button>)}
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
              canReview={team.mode === "playback" && team.incidents.some(i => i.room === monitoringRoom && i.phase !== "resolved")}
              onClearFrame={() => onMonitorFrame("clear")} />
          </div>
          <div className="facility-bottom-grid">
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
                <div className="facility-empty">No open concerns</div>
              )}
            </section>
            <section className="facility-card">
              <div className="facility-card-heading">
                <h2>Activity</h2>
                <Eye size={16} />
              </div>
              {team.events.length ? (
                <ol className="facility-activity">
                  {team.events
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
                <div className="facility-empty">No activity yet</div>
              )}
            </section>
          </div>
          {current && (
            <div ref={incidentRef}>
              <div className="incident-picker">
                {team.incidents.map((i) => (
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
          <PanoramicAssistant key={`${team.userId}:${team.facilityId}`} team={team} selectedId={selectedId} onSelect={showIncident} onSignIn={onSignIn} />
        </aside>
      </div>
    </div>
  );
}
