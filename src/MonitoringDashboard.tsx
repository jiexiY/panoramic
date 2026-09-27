import { useEffect, useReducer } from "react";
import { ArrowRight } from "lucide-react";
import { suiteIds, suiteRecords, type SuiteId } from "./suiteRecords";
import SiteLink, { type Navigate } from "./SiteLink";
import { dashboardSuitePath, suitePath } from "./routes";
import { routeLevels, type RoutePriority } from "./routeRisk";
import type { CareTeam } from "./useCareTeam";
import { noHazardVisible } from "./incidents";
import { isBathroomRecording } from "./playback";
import RoomMonitoring from "./RoomMonitoring";
import MonitorStatus from "./MonitorStatus";
import { initialFloorMonitoring, floorMonitoringReducer } from "./floorMonitoring";
import type { TrackingRun } from "./suiteTracking";
import "./facility.css";
import "./room-monitoring.css";
import "./monitoring-dashboard.css";

type Props = {
  suite?: SuiteId;
  navigate: Navigate;
  autoStartRecording: boolean;
  onMonitorFrame: (value: "hazard" | "clear" | "unknown") => void;
  onTracking: (run: TrackingRun) => void;
  team: CareTeam;
};

export default function MonitoringDashboard({ suite, navigate, autoStartRecording, onMonitorFrame, onTracking, team }: Props) {
  const monitoringRoom = suite ?? "A101";
  const [monitors, monitorAction] = useReducer(floorMonitoringReducer, undefined, initialFloorMonitoring);
  // This owner stays mounted across all workspace pages. Page/suite selection
  // changes presentation only; session restoration still gates local samples.
  useEffect(() => { if (autoStartRecording) monitorAction({ type: "start" }); }, [autoStartRecording]);
  const priorities: Record<string, RoutePriority> = {};
  for (const i of team.incidents.filter(i => i.phase !== "resolved")) {
    if (!(i.room in priorities) || routeLevels[i.priority].rank > routeLevels[priorities[i.room]].rank) priorities[i.room] = i.priority;
  }
  return <div className="monitoring-dashboard facility-page">
    <section className="page-heading facility-heading">
      <h1>Dashboard</h1>
      <MonitorStatus />
    </section>
    <div className="dashboard-monitor-heading">
      <div><h2>Suite monitoring</h2><p>Bedroom and bathroom tracking</p></div>
      <SiteLink className="secondary" to={suitePath(monitoringRoom)} navigate={navigate}>Suite {monitoringRoom} on Resident Floor <ArrowRight size={15} /></SiteLink>
    </div>
    {team.facility && team.stale && <div className="notice error" role="alert">Connection needs attention. The information below may be out of date.</div>}
    <div className="room-monitor-workspace">
      <nav className="room-monitor-selector" aria-label="Dashboard suite selection">
        {suiteIds.map(id => <SiteLink key={id} to={dashboardSuitePath(id)} navigate={navigate} aria-current={monitoringRoom === id ? "page" : undefined}>Suite {id}</SiteLink>)}
      </nav>
      {/* Keep every source mounted; hidden suites and pages continue processing. */}
      {suiteIds.map(room => {
        const records = suiteRecords(room, team.incidents, team.events);
        const recording = monitors[room].recording;
        return <div key={room} hidden={room !== monitoringRoom}>
          <RoomMonitoring room={room} priority={priorities[room] ?? "unassessed"}
            demoEnabled={autoStartRecording} onTracking={onTracking}
            recording={recording} onRecordingAction={action => {
              monitorAction({ type: "recording", room, action });
              if (room !== "A101") return;
              if (action.type === "loaded" && action.version === recording.version && recording.mode === "loading") onMonitorFrame("hazard");
              if (action.type === "failed" && action.version === recording.version) onMonitorFrame("unknown");
            }}
            clearVisible={records.open.length > 0 && records.open.every(noHazardVisible)}
            closed={!records.open.length && !!records.incidents[0]?.nursing_checked_by}
            canReview={team.mode === "playback" && records.open.some(isBathroomRecording)}
            onClearFrame={() => { if (room === "A101") onMonitorFrame("clear"); }} />
        </div>;
      })}
    </div>
  </div>;
}
