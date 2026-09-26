import { useEffect, useRef, useState } from "react";
import { playbackStart, playbackWater, playbackCommand, playbackFacility } from "./playback";
import type { CareTeam } from "./useCareTeam";
import type { SharedIncident } from "./incidents";

export function usePlaybackTeam() {
  const [active, setActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [actor, setActor] = useState("supervisor");
  const [state, setState] = useState(() => playbackStart(Date.now()));
  const ref = useRef(state); ref.current = state;
  const [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { if (!active) return; const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  useEffect(() => {
    if (!active || !scanning) return;
    const timer = setTimeout(() => { setState(s => playbackWater(s, Date.now())); setScanning(false); }, 2500);
    return () => clearTimeout(timer);
  }, [active, scanning]);
  const start = () => { setState(playbackStart(Date.now())); setActor("supervisor"); setError(""); setActive(true); setScanning(true); };
  const stop = () => { setActive(false); setScanning(false); };
  const command = async (action: string, payload: Record<string, unknown>) => {
    try { const next = playbackCommand(ref.current, actor, action, payload, Date.now()); ref.current = next; setState(next); setError(""); return next.incidents.find(i => i.id === payload.id); }
    catch(e) { const message = e instanceof Error ? e.message : "Response failed."; setError(message); throw new Error(message); }
  };
  const team: CareTeam = { mode: "playback", userId: actor, facilityId: playbackFacility.id, facility: playbackFacility, facilities: [playbackFacility],
    setFacilityId: () => {}, incidents: state.incidents, members: state.members, events: state.events, me: state.members.find(m => m.user_id === actor)!,
    error, setError, busy: false, loading: false, connected: false, syncedAt: clock, stale: false, clock, refresh: async () => {}, command,
    publish: async () => { throw new Error("Exit recording playback before saving an analyzed image to a care team."); },
    act: (i: SharedIncident, action: string, note = "") => command(action, {id:i.id,version:i.version,request_id:crypto.randomUUID(),note}),
  };
  return {active, scanning, actor, setActor, start, stop, team};
}
