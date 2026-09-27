import { useEffect, useState } from "react";
import { ArrowRight, Check, Download, Image as ImageIcon } from "lucide-react";
import type { CareTeam } from "./useCareTeam";
import { handoffText, incidentStatus, noHazardVisible, type SharedIncident } from "./incidents";
import DispatchResponse from "./DispatchResponse";
import { cloud } from "./cloud";
import { routeLevels } from "./routeRisk";
import RouteOverlay from "./RouteOverlay";
import { leakReferenceImage } from "./leakSequence";
import { trackingReference } from "./suiteTracking";
import "./team.css";

export default function IncidentDesk({
  team,
  incident,
}: {
  team: CareTeam;
  incident: SharedIncident;
}) {
  const [note, setNote] = useState("");
  const [image, setImage] = useState("");
  const [imageError, setImageError] = useState("");
  useEffect(() => {
    setNote("");
  }, [incident.id]);
  useEffect(() => {
    let active = true;
    let url = "";
    setImage("");
    setImageError("");
    if (incident.observation.source === "recording") setImage(trackingReference(incident.room, incident.zone, incident.media_name) || (incident.room === "A104" && incident.media_name === "a104-water-leak-opencv.gif" ? leakReferenceImage(incident.frame_time) : incident.room === "A101" && incident.zone === "Bathroom" && incident.media_name === "bathroom-tracking.gif" ? "/demo/bathroom-water.jpg" : ""));
    if (incident.evidence_path && cloud)
      void cloud.storage
        .from("care-evidence")
        .download(incident.evidence_path)
        .then(({ data, error }) => {
          if (!active) return;
          if (error || !data) {
            setImageError(
              "Reference frame is unavailable. The observation and response remain saved.",
            );
            return;
          }
          url = URL.createObjectURL(data);
          setImage(url);
        });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [incident.id, incident.evidence_path, incident.frame_time, incident.media_name, incident.room, incident.zone, team.userId]);
  const assigned = team.members.find((m) => m.user_id === incident.assigned_to);
  const mine = incident.assigned_to === team.userId;
  const canAccept =
    !!team.me?.qualified && mine && incident.phase === "dispatched" &&
    !team.incidents.some(
      (i) =>
        i.assigned_to === team.userId &&
        i.id !== incident.id && ["dispatched", "acknowledged", "arrived"].includes(i.phase),
    );
  const events = team.events.filter((e) => e.incident_id === incident.id);
  const busy = team.busy || team.stale;
  const act = (action: "acknowledge" | "arrive" | "resolve" | "decline" | "supervision_check" | "nursing_check") => {
    void team.act(incident, action, note).catch(() => {});
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([handoffText(incident, events, team.members)], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `panoramic-response-${incident.id.slice(0, 8)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section
      className="card incident-desk"
      aria-label={`${incident.room} ${incident.zone} response`}
    >
      <div className="incident-title">
        <span className="eyebrow">
          {incident.room} / {incident.zone.toUpperCase()}
        </span>
        <span
          className={`facility-chip ${incident.escalated_at ? "alert" : ""}`}
        >
          {incident.escalated_at
            ? "ESCALATED"
            : incidentStatus(incident).toUpperCase()}
        </span>
      </div>
      <h2>
        {incident.phase === "resolved"
          ? "Response recorded"
          : "Environmental concern"}
      </h2>
      <p>{incident.observation.scene.brief}</p>
      <span
        className="route-badge"
        style={{
          background: routeLevels[incident.priority]?.color,
          color: routeLevels[incident.priority]?.ink,
        }}
      >
        {routeLevels[incident.priority]?.label ?? "Route not assessed"}
      </span>
      {incident.escalated_at && (
        <p className="incident-escalation" role="alert">
          Coordinator attention required.{" "}
          {incident.phase === "flagged"
            ? "Assignment is needed."
            : incident.phase === "dispatched" ? "The assigned caregiver has not accepted."
            : incident.phase === "acknowledged"
              ? "Arrival has not been confirmed."
              : "The response remains open."}
        </p>
      )}
      <div className="incident-reference">
        {image ? (
          <div className="scene-canvas">
            <img src={image} alt={`Saved ${incident.room} reference frame`} />
            <RouteOverlay
              route={incident.route}
              draft={[]}
              drawing={false}
              observations={incident.observation.scene.observations}
              onPoint={() => {}}
            />
            {incident.observation.scene.observations.map((o, i) => (
              <div
                key={i}
                className="incident-box"
                style={{
                  top: `${o.box[0] / 10}%`,
                  left: `${o.box[1] / 10}%`,
                  height: `${(o.box[2] - o.box[0]) / 10}%`,
                  width: `${(o.box[3] - o.box[1]) / 10}%`,
                  borderColor: o.kind === "object" ? "#00cf50" : "#ed3232",
                }}
              >
                <b>{o.label}</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="team-empty">
            <ImageIcon size={24} />
            <p>
              {imageError ||
                (incident.evidence_path
                  ? "Loading private reference frame…"
                  : "Reference frame not attached")}
            </p>
          </div>
        )}
      </div>
      <details className="evidence-caption">
        <summary>Observation details</summary>
        <p>
          {incident.media_name}
          {incident.frame_time !== null
            ? ` · ${incident.frame_time.toFixed(1)}s`
            : ""}
        </p>
        <ul>
          {incident.observation.scene.observations.map((o, i) => (
            <li key={i}>
              <b>{o.label}:</b> {o.evidence}
            </li>
          ))}
        </ul>
        <p>{incident.observation.scene.uncertainty}</p>
        <small>
          {incident.observation.source === "recording" ? "Annotated recording playback" : `${incident.observation.model} output saved by a team member`} ·{" "}
          {new Date(incident.observation.analyzedAt).toLocaleString()}
        </small>
      </details>
      <ol className="response-progress" aria-label="Response progress">
        {(["flagged", "dispatched", "acknowledged", "arrived", "resolved"] as const).map((phase, index) => <li key={phase} data-complete={index <= ["flagged", "dispatched", "acknowledged", "arrived", "resolved"].indexOf(incident.phase)} aria-current={phase === incident.phase ? "step" : undefined}>{["Flagged", "Assigned", "Accepted", "Arrived", "Both stations signed"][index]}</li>)}
      </ol>
      <DispatchResponse team={team} incident={incident} />
      {incident.phase === "flagged" && team.me?.role !== "coordinator" && <p>Waiting for the supervision station to assign a responder.</p>}
      {incident.phase === "dispatched" && (
        <div className="incident-action">
          <p>Assigned to {assigned?.display_name ?? "caregiver"} · acceptance pending</p>
          {mine && <><button
            className="primary full"
            disabled={busy || !canAccept}
            onClick={() => act("acknowledge")}
          >
            Accept response <ArrowRight size={16} />
          </button>
          <details><summary>Unable to respond?</summary><label className="team-field">Reason<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="Tell the supervision station why you cannot attend." /></label><button className="secondary full" disabled={busy || note.trim().length < 8} onClick={() => act("decline")}>Return to supervision</button></details></>}
        </div>
      )}
      {incident.phase === "acknowledged" && (
        <div className="incident-action">
          <p>{assigned?.display_name} accepted · arrival pending</p>
          {mine && (
            <button
              className="primary full"
              disabled={busy}
              onClick={() => act("arrive")}
            >
              I have arrived <Check size={16} />
            </button>
          )}
        </div>
      )}
      {incident.phase === "arrived" && (
        <div className="incident-action">
          <p>{assigned?.display_name} is attending</p>
          {mine && !incident.closure_requested && (
            <>
              <label className="team-field">
                What did you check or do?
                <textarea
                  value={note}
                  minLength={8}
                  maxLength={1000}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Record what you found, the action taken, and any remaining concern."
                />
              </label>
              <button
                className="primary full"
                disabled={busy || note.trim().length < 8}
                onClick={() => act("resolve")}
              >
                Request safety sign-off <Check size={16} />
              </button>
            </>
          )}
        </div>
      )}
      {incident.phase !== "resolved" && <section className="station-checks" aria-label="Station sign-offs">
        <h3>Safety verification</h3>
        <p>{noHazardVisible(incident) ? "No hazard visible in the follow-up frame. Physical safety still needs staff confirmation." : "Waiting for a clear follow-up frame. The concern remains open."}</p>
        {incident.review_observation && <details><summary>Follow-up observation</summary><p>{incident.review_observation.scene.brief}</p><p>{incident.review_observation.scene.uncertainty}</p><small>{incident.review_observation.model} · {new Date(incident.review_observation.analyzedAt).toLocaleString()}</small></details>}
        {incident.closure_requested && <p className="recorded-note">Caregiver outcome: {incident.resolution}</p>}
        <div className="station-check"><b>1. Supervision station</b><span>{incident.supervision_checked_by ? "Checked · nursing review requested" : "Pending physical safety check"}</span>
          {team.me?.role === "coordinator" && !incident.supervision_checked_by && <button className="secondary full" disabled={busy || !incident.closure_requested || !noHazardVisible(incident)} onClick={() => act("supervision_check")}>Confirm physical safety check</button>}
        </div>
        <div className="station-check"><b>2. Nursing station</b><span>{incident.nursing_checked_by ? "Checked" : "Pending independent sign-off"}</span>
          {team.me?.role === "nurse" && !incident.nursing_checked_by && <button className="primary full" disabled={busy || !incident.supervision_checked_by || !noHazardVisible(incident) || incident.supervision_checked_by === team.userId} onClick={() => act("nursing_check")}>Confirm nursing check & close</button>}
        </div>
      </section>}
      {team.error && <p className="form-error" role="alert">{team.error}</p>}
      {incident.phase === "resolved" && (
        <p className="recorded-note">{incident.resolution}</p>
      )}
      <ol className="incident-timeline">
        {events.map((e) => (
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
      <button className="secondary full" onClick={download}>
        <Download size={15} /> Download handoff record
      </button>
    </section>
  );
}
