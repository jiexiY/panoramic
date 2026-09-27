import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
} from "lucide-react";
import { suiteIds, suiteRecords, isSuiteId, type SuiteId } from "./suiteRecords";
import SiteLink, { type Navigate } from "./SiteLink";
import { dashboardSuitePath, suitePath } from "./routes";
import { routeLevels, type RoutePriority } from "./routeRisk";
import type { CareTeam } from "./useCareTeam";
import SuiteAI from "./SuiteAI";
import MonitorStatus from "./MonitorStatus";
import { StationVoiceProvider } from "./StationVoice";
import { incidentVoiceMessage } from "./stationAnnouncement";
import "./facility.css";
import "./room-monitoring.css";

const FacilityMap = lazy(() => import("./FacilityMap"));
type Props = {
  suite?: SuiteId;
  navigate: Navigate;
  active: boolean;
  processing: boolean;
  team: CareTeam;
  onSignIn: () => void;
};
export default function FacilityWorkspace({
  suite,
  navigate,
  active,
  processing,
  team,
  onSignIn,
}: Props) {
  const monitoringRoom = suite ?? "A101";
  const selectSuite = (room: string | null) => { if (isSuiteId(room)) navigate(suitePath(room)); };
  const [selectedId, setSelectedId] = useState("");
  const incidentRef = useRef<HTMLElement>(null);
  useEffect(() => { setSelectedId(""); }, [team.facilityId, team.mode, monitoringRoom]);
  const roomRecords = suiteRecords(monitoringRoom, team.incidents, team.events);
  const { open, incidents } = roomRecords;
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
    <StationVoiceProvider key={`${team.userId}:${team.facilityId}`} supervisor={team.me?.role === "coordinator"} active={active && !team.stale} scope={monitoringRoom}
      messages={team.incidents.flatMap(i => { if (!isSuiteId(i.room)) return []; const message = incidentVoiceMessage(i.room, i); return message ? [message] : []; })}>
    <div className="facility-page">
      <section className="page-heading facility-heading">
        <h1>{suite ? `Suite ${suite}` : "Resident Floor"}</h1>
        <SiteLink className="secondary" to={dashboardSuitePath(monitoringRoom)} navigate={navigate}>View monitoring <ArrowRight size={15} /></SiteLink>
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
              <MonitorStatus />
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
          <nav className="room-monitor-selector facility-suite-navigation" aria-label="Resident Floor suite selection">
            {suiteIds.map(id => <SiteLink key={id} to={suitePath(id)} navigate={navigate} aria-current={monitoringRoom === id ? "page" : undefined}>Suite {id}</SiteLink>)}
          </nav>

        </div>
        <aside ref={incidentRef} className="facility-sidebar" aria-label="Panoramic assistant">
          <SuiteAI key={`${team.userId}:${team.facilityId}:${monitoringRoom}`} room={monitoringRoom} team={team} selectedId={current?.id ?? ""} onSelect={showIncident} onSignIn={onSignIn} processing={monitoringRoom === "A101" && processing} active={active} />
        </aside>
      </div>
    </div></StationVoiceProvider>
  );
}
