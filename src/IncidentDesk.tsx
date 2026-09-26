import { useEffect, useState } from "react";
import { ArrowRight, Check, Download, Image as ImageIcon } from "lucide-react";
import type { CareTeam } from "./useCareTeam";
import { handoffText, memberAvailable, type SharedIncident } from "./incidents";
import { cloud } from "./cloud";
import { routeLevels } from "./routeRisk";
import RouteOverlay from "./RouteOverlay";
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
  }, [incident.id, incident.evidence_path, team.userId]);
  const assigned = team.members.find((m) => m.user_id === incident.assigned_to);
  const suggested = team.members.find(
    (m) => m.user_id === incident.suggested_to,
  );
  const mine = incident.assigned_to === team.userId;
  const canAccept =
    !!team.me &&
    memberAvailable(team.me, team.clock) &&
    !team.incidents.some(
      (i) =>
        i.assigned_to === team.userId &&
        ["acknowledged", "arrived"].includes(i.phase),
    );
  const events = team.events.filter((e) => e.incident_id === incident.id);
  const busy = team.busy || team.stale;
  const act = (action: "acknowledge" | "arrive" | "resolve") => {
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
            : incident.phase === "flagged"
              ? "AWAITING RESPONSE"
              : incident.phase.toUpperCase()}
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
            ? "No caregiver has accepted."
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
          {incident.observation.model} output saved by a team member ·{" "}
          {new Date(incident.observation.analyzedAt).toLocaleString()}
        </small>
      </details>
      {incident.phase === "flagged" && (
        <div className="incident-action">
          <p>
            {suggested
              ? `Requested: ${suggested.display_name}`
              : "Coverage gap · no available, eligible caregiver"}
          </p>
          <button
            className="primary full"
            disabled={busy || !canAccept}
            onClick={() => act("acknowledge")}
          >
            Accept response <ArrowRight size={16} />
          </button>
          {!canAccept && (
            <small>
              Mark yourself available after eligibility is confirmed.
            </small>
          )}
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
          {mine && (
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
                Save resolution <Check size={16} />
              </button>
            </>
          )}
        </div>
      )}
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
