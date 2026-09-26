import { useEffect, useState } from "react";
import { Send, UserRoundCheck } from "lucide-react";
import type { CareTeam } from "./useCareTeam";
import { eligibleResponders, type SharedIncident } from "./incidents";

export default function DispatchResponse({ team, incident, preferred = "" }: {
  team: CareTeam; incident: SharedIncident; preferred?: string;
}) {
  const candidates = eligibleResponders(team.members, team.incidents, team.clock);
  const [target, setTarget] = useState(preferred);
  const [confirmation, setConfirmation] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const person = candidates.find(m => m.user_id === target);
  useEffect(() => { setTarget(preferred); setConfirmation(false); }, [preferred, incident.id]);
  useEffect(() => { setConfirmation(false); setRequestId(crypto.randomUUID()); }, [incident.version, target]);
  if (team.me?.role !== "coordinator" || !["flagged", "dispatched"].includes(incident.phase)) return null;
  const send = async () => {
    if (!person || team.stale || team.busy) return;
    try {
      await team.command("dispatch", { id: incident.id, version: incident.version, caregiver_id: person.user_id, request_id: requestId });
      setConfirmation(false);
    } catch { /* Shared care-team error is rendered below. */ }
  };
  return <div className="dispatch-response">
    <h3><UserRoundCheck size={17} /> {incident.phase === "dispatched" ? "Reassign response" : "Assign response"}</h3>
    <label className="team-field">Available caregiver
      <select value={person ? target : ""} onChange={e => setTarget(e.target.value)} disabled={team.busy || team.stale}>
        <option value="">Select a responder</option>
        {candidates.map(m => <option key={m.user_id} value={m.user_id}>{m.display_name} · response order {m.response_order}</option>)}
      </select>
    </label>
    {!candidates.length && <p className="coverage-gap">{incident.phase === "dispatched" ? "No other eligible caregiver is currently available for reassignment." : "No eligible caregiver is currently available. Arrange coverage at the supervision station."}</p>}
    {confirmation && person ? <div className="dispatch-confirm" role="group" aria-label="Confirm caregiver assignment">
      <p>Send <b>{incident.room} · {incident.zone}</b> to <b>{person.display_name}</b>?</p>
      <small>Reserves this responder. They must accept before attendance is recorded.</small>
      <div className="button-row"><button className="secondary" onClick={() => setConfirmation(false)} disabled={team.busy}>Cancel</button>
        <button className="primary" disabled={team.busy || team.stale} onClick={() => void send()}><Send size={14} /> Confirm assignment</button></div>
    </div> : <button className="secondary full" disabled={!person || team.busy || team.stale} onClick={() => setConfirmation(true)}>Review assignment <Send size={14} /></button>}
    {team.error && <p role="alert" className="form-error">{team.error}</p>}
  </div>;
}
