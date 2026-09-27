import { useEffect, useRef, useState } from "react";
import { playbackStart, playbackWater, playbackObservation, playbackCommand, playbackFacility } from "./playback";
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
  const activeRef = useRef(active); activeRef.current = active;
  useEffect(() => { if (!active) return; const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  useEffect(() => {
    if (!active || !scanning) return;
    const timer = setTimeout(() => {
      const next = ref.current.incidents.some(i=>i.phase!=="resolved") ? playbackObservation(ref.current, "hazard", Date.now()) : playbackWater(ref.current, Date.now());
      ref.current = next; setState(next); setScanning(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, [active, scanning]);
  const start = () => { const next = playbackStart(Date.now()); ref.current = next; setState(next); setActor("supervisor"); setError(""); activeRef.current = true; setActive(true); setScanning(false); };
  const stop = () => { setActive(false); setScanning(false); };
  const pause = () => setScanning(false);
  const monitorFrame = (value: "hazard" | "clear" | "unknown") => {
    if (value === "hazard") {
      if (!activeRef.current) start();
      setScanning(true);
    } else if (activeRef.current) {
      setScanning(false);
      const next = playbackObservation(ref.current, value, Date.now()); ref.current = next; setState(next);
    }
  };
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
  return {active, scanning, actor, setActor, start, stop, pause, monitorFrame, team};
}
