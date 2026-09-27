import type { RecordingState } from "./recordingObservation";
import { recordingSourceLabel } from "./recordingObservation";

// Enabled is the floor-wide monitoring policy, not a claim that every camera is connected.
export default function MonitorStatus() {
  return <span className="monitor-status" role="status" aria-label="Resident Floor monitor: On"
    title="Monitoring is enabled across the whole Resident Floor. Source availability is shown separately in each suite.">
    Monitor: <span className="monitor-state"><i aria-hidden="true" /> On</span>
    <small>Resident Floor</small>
  </span>;
}

export function SourceStatus({ room, recording }: { room: string; recording: RecordingState }) {
  return <span className="monitor-source-status" role="status">Source: {recordingSourceLabel(recording, room)}</span>;
}
