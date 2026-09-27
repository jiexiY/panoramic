import { useState } from "react";
import { Users, RefreshCw } from "lucide-react";
import type { CareTeam } from "./useCareTeam";
import { memberAvailable } from "./incidents";
import "./team.css";

export default function CareTeamPanel({
  team,
  onSignIn,
}: {
  team: CareTeam;
  onSignIn: () => void;
}) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [eligible, setEligible] = useState(false);
  const [order, setOrder] = useState(1);
  const [memberRole, setMemberRole] = useState<"caregiver" | "nurse">("caregiver");
  const [edit, setEdit] = useState(false);
  const run = (job: Promise<unknown>) => {
    void job.catch(() => {});
  };
  if (team.mode === "playback") return <section className="card care-team-panel"><div className="card-title"><Users size={19}/><h2>Response team</h2></div>{team.members.map(m=><p key={m.user_id}>{m.display_name} · {m.role === "coordinator" ? "Supervision" : m.available ? "Available" : "Reserved / unavailable"}</p>)}<small>Playback roles · change your view using the bar above.</small></section>;
  return (
    <section className="card care-team-panel">
      <div className="card-title">
        <Users size={19} />
        <h2>{team.facility?.name ?? "Care team"}</h2>
        {team.userId && (
          <button
            className="text-button"
            aria-label="Refresh care team"
            onClick={() => run(team.refresh())}
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>
      {!team.userId ? (
        <>
          <p className="team-empty">
            Sign in to receive concerns and save responses.
          </p>
          <button className="secondary" onClick={onSignIn}>
            Connect care team
          </button>
        </>
      ) : team.loading ? (
        <p className="team-empty">Loading your workspace…</p>
      ) : !team.facility ? (
        <form
          className="team-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(team.command("create_facility", { name, display_name: label }));
          }}
        >
          <label>
            Care center
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={80}
              required
              placeholder="Center name"
            />
          </label>
          <label>
            Your team name
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              minLength={2}
              maxLength={40}
              required
              placeholder="Coordinator"
            />
          </label>
          <button className="primary" disabled={team.busy}>
            Create workspace
          </button>
          <p className="fine-print">
            Already part of a team? Ask the coordinator to add your account,
            then refresh.
          </p>
        </form>
      ) : (
        <>
          {team.facilities.length > 1 && (
            <label className="team-field">
              Workspace
              <select
                value={team.facilityId}
                onChange={(e) => team.setFacilityId(e.target.value)}
              >
                {team.facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div
            className={`team-sync ${team.stale ? "stale" : ""}`}
            role="status"
          >
            <span />
            {team.stale
              ? "Connection needs attention"
              : team.connected
                ? "Connected · live updates"
                : "Connected · checking every 15s"}
          </div>
          {team.members.map((m) => (
            <div className="team-person" key={m.user_id}>
              <span className="person-initial">{m.display_name[0]}</span>
              <div>
                <b>
                  {m.display_name}
                  {m.user_id === team.userId ? " · you" : ""}
                </b>
                <small>
                  {m.role === "coordinator" ? "Supervision" : m.role === "nurse" ? "Nursing station" : "Caregiver"}
                  {!m.qualified ? " · eligibility not confirmed" : ""}
                </small>
              </div>
              <span
                className={`availability-chip ${memberAvailable(m, team.clock) ? "available" : ""}`}
              >
                {memberAvailable(m, team.clock)
                  ? "Available"
                  : m.available
                    ? "Offline"
                    : "Unavailable"}
              </span>
            </div>
          ))}
          {team.me?.qualified && (
            <button
              className="secondary full"
              disabled={team.busy || team.stale}
              onClick={() =>
                run(
                  team.command("availability", {
                    available: !team.me?.available,
                  }),
                )
              }
            >
              {team.me.available
                ? "Mark me unavailable"
                : "I am available to respond"}
            </button>
          )}
          <p className="fine-print">
            Keep this screen open to receive updates. Phone push and SMS are not
            connected.
          </p>
          {team.me?.role === "coordinator" && (
            <details
              open={edit}
              onToggle={(e) => setEdit(e.currentTarget.open)}
              className="team-settings"
            >
              <summary>Manage team</summary>
              <form
                className="team-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    team
                      .command("add_member", {
                        email,
                        display_name: memberName,
                        qualified: eligible,
                        response_order: order,
                        role: memberRole,
                      })
                      .then(() => {
                        setEmail("");
                        setMemberName("");
                        setEligible(false);
                        setEdit(false);
                      }),
                  );
                }}
              >
                <label>
                  Confirmed account email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Team name
                  <input
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    minLength={2}
                    maxLength={40}
                    required
                    placeholder="Caregiver 01"
                  />
                </label>
                <label>Station role<select value={memberRole} onChange={e=>setMemberRole(e.target.value as "caregiver" | "nurse")}><option value="caregiver">Caregiver</option><option value="nurse">Nursing station</option></select></label>
                <label>
                  Response order
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={order}
                    onChange={(e) => setOrder(Number(e.target.value))}
                    required
                  />
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={eligible}
                    onChange={(e) => setEligible(e.target.checked)}
                  />
                  <span>Eligible to check environmental concerns</span>
                </label>
                <button className="primary" disabled={team.busy || team.stale}>
                  Add or update caregiver
                </button>
              </form>
            </details>
          )}
        </>
      )}
      {team.error && (
        <p className="form-error" role="alert">
          {team.error}
        </p>
      )}
    </section>
  );
}
