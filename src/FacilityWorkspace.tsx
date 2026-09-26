import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  Download,
  Eye,
  Map,
  Monitor,
  Play,
  Square,
  X,
} from "lucide-react";
import { suiteIds, type SpaceId } from "./facility";
import { routeLevels, type RoutePriority } from "./routeRisk";
import type { CareTeam } from "./useCareTeam";
import { memberAvailable } from "./incidents";
import CareTeamPanel from "./CareTeamPanel";
import IncidentDesk from "./IncidentDesk";
import SuitePlan from "./SuitePlan";
import "./facility.css";

const FacilityMap = lazy(() => import("./FacilityMap"));
const trackingMedia = {
  gif: "/demo/bathroom-tracking.gif?v=opencv-2",
  still: "/demo/bathroom-tracking-poster.png?v=opencv-2",
};
type Props = {
  mode: "spatial" | "supervision";
  active: boolean;
  onMode: (mode: "spatial" | "supervision") => void;
  team: CareTeam;
  onSignIn: () => void;
};
export default function FacilityWorkspace({
  mode,
  active,
  onMode,
  team,
  onSignIn,
}: Props) {
  const [selected, setSelected] = useState<SpaceId | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const recordingRef = useRef<HTMLElement>(null);
  const incidentRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    if (mode === "supervision" && active) setSelected("supervision");
    if (!active) setPlaying(false);
  }, [mode, active]);
  useEffect(() => {
    if (evidenceOpen)
      recordingRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }, [evidenceOpen]);
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
        <div>
          <p className="eyebrow">
            {team.facility?.name.toUpperCase() ?? "RESIDENTIAL CARE"} / FLOOR 01
          </p>
          <h1>{mode === "spatial" ? "Spatial view" : "Supervision"}</h1>
        </div>
        <button
          className="secondary"
          onClick={() => {
            setEvidenceOpen(true);
            setPlaying(true);
          }}
        >
          <Play size={15} /> Open bathroom recording
        </button>
      </section>
      <div className="facility-tabs">
        <button
          aria-current={mode === "spatial" ? "page" : undefined}
          onClick={() => onMode("spatial")}
        >
          <Map size={16} /> Floor overview
        </button>
        <button
          aria-current={mode === "supervision" ? "page" : undefined}
          onClick={() => onMode("supervision")}
        >
          <Monitor size={16} /> Supervision desk
        </button>
      </div>
      {team.facility && team.stale && (
        <div className="notice error" role="alert">
          Connection needs attention. The information below may be out of date.
        </div>
      )}
      <div className="facility-grid">
        <div className="facility-main">
          <section className="facility-map-panel">
            <div className="facility-panel-header">
              <span>
                <Building2 size={16} /> Care-center floor
              </span>
              <span>
                {team.facility
                  ? team.connected
                    ? "Live updates"
                    : "Saved observations"
                  : "No observations"}
              </span>
            </div>
            <Suspense
              fallback={
                <div className="facility-map-loading">
                  Opening spatial view…
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
                          : i.phase === "flagged"
                            ? "Awaiting caregiver"
                            : i.phase === "acknowledged"
                              ? "Arrival pending"
                              : "Caregiver attending"}
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
                    .slice(-4)
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
        <aside className="facility-sidebar" aria-label="Rooms and care team">
          <section className="facility-card facility-summary">
            <div>
              <small>Rooms</small>
              <b>4</b>
            </div>
            <div>
              <small>Available staff</small>
              <b>
                {
                  team.members.filter((m) => memberAvailable(m, team.clock))
                    .length
                }
                <em> / {team.members.length}</em>
              </b>
            </div>
            <div>
              <small>Concerns</small>
              <b>{open.length}</b>
            </div>
          </section>
          <CareTeamPanel team={team} onSignIn={onSignIn} />
          <section className="facility-card room-directory">
            <div className="facility-card-heading">
              <h2>Rooms</h2>
              <span className="small-count">4 suites</span>
            </div>
            <div className="room-filters">
              <button
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                All
              </button>
              <button
                aria-pressed={filter === "attention"}
                onClick={() => setFilter("attention")}
              >
                Needs review {Object.keys(priorities).length}
              </button>
            </div>
            {suiteIds
              .filter((id) => filter === "all" || id in priorities)
              .map((id) => (
                <button
                  className={`facility-room-row ${selected === id ? "selected" : ""}`}
                  key={id}
                  onClick={() => {
                    setSelected(id);
                    const i = open.find((i) => i.room === id);
                    if (i) setSelectedId(i.id);
                  }}
                >
                  <span
                    className="room-dot"
                    style={
                      id in priorities
                        ? { background: routeLevels[priorities[id]].color }
                        : undefined
                    }
                  />
                  <span>
                    <b>Suite {id}</b>
                    <small>Bedroom · bathroom</small>
                  </span>
                  <span className="room-state">
                    {id in priorities ? routeLevels[priorities[id]].short : "—"}
                  </span>
                </button>
              ))}
            {filter === "attention" && !open.length && (
              <p className="facility-empty">No open concerns</p>
            )}
            <button
              className="facility-room-row supervision-row"
              onClick={() => {
                setSelected("supervision");
                onMode("supervision");
              }}
            >
              <Monitor size={18} />
              <span>
                <b>Supervision room</b>
                <small>Caregivers & nurses</small>
              </span>
              <ArrowRight size={14} />
            </button>
          </section>
          {selected && selected !== "supervision" && (
            <section className="facility-card room-detail">
              <div className="facility-card-heading">
                <h2>Suite {selected}</h2>
                <span className="facility-chip">LAYOUT</span>
              </div>
              <SuitePlan
                alert={open.some(
                  (i) => i.room === selected && i.zone === "Bathroom",
                )}
              />
              <div className="suite-plan-caption">
                Bedroom · kitchenette · closets · accessible bath
              </div>
            </section>
          )}
          <section className="facility-card">
            <h2>Route concern</h2>
            <div className="facility-scale">
              <span style={{ background: "#fbe5d5" }} />
              <span style={{ background: "#b85a36" }} />
              <span style={{ background: "#652b26" }} />
            </div>
            <div className="facility-scale-labels">
              <span>L1 · Off route</span>
              <span>L2 · Near</span>
              <span>L3 · On route</span>
            </div>
            <div className="facility-key">
              <span>
                <i className="key-unknown" />
                Not assessed
              </span>
            </div>
          </section>
        </aside>
      </div>
      {evidenceOpen && (
        <section
          ref={recordingRef}
          className="facility-evidence"
          aria-label="Bathroom recording"
        >
          <div className="facility-panel-header">
            <span>RECORDING REVIEW</span>
            <div>
              <button
                className="text-button"
                onClick={() => setPlaying(!playing)}
              >
                {playing ? <Square size={14} /> : <Play size={14} />}{" "}
                {playing ? "Show still" : "Play tracking"}
              </button>
              <a
                className="text-button"
                href={trackingMedia.gif}
                download="panoramic-bathroom-tracking.gif"
              >
                <Download size={14} /> Download
              </a>
              <button
                className="text-button"
                aria-label="Close recording"
                onClick={() => {
                  setEvidenceOpen(false);
                  setPlaying(false);
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <img
            className="bathroom-gif"
            src={playing ? trackingMedia.gif : trackingMedia.still}
            alt="OpenCV tracking playback of annotated bathroom objects and a walking-route concern"
          />
          <details className="evidence-caption">
            <summary>Recording details</summary>
            <p>
              Image-based playback with an AI-edited source image and manually
              annotated regions. OpenCV tracks their movement. Opening this
              recording does not create a care-team alert.
            </p>
          </details>
        </section>
      )}
    </div>
  );
}
