import type { RecordingState } from "./recordingObservation";
import { recordingSourceLabel } from "./recordingObservation";
import { monitoringImage, type MonitorZone } from "./monitoringImages";
import { trackingSource } from "./suiteTracking";

// Enabled is the floor-wide monitoring policy, not a claim that every camera is connected.
export default function MonitorStatus() {
  return <span className="monitor-status" role="status" aria-label="Resident Floor monitor: On"
    title="Monitoring is enabled across the whole Resident Floor. Source availability is shown separately in each suite.">
    Monitor: <span className="monitor-state"><i aria-hidden="true" /> On</span>
    <small>All 4 suites</small>
  </span>;
}

export function SourceStatus({ room, recording, zone = "bathroom" }: { room: string; recording: RecordingState; zone?: MonitorZone }) {
  if (trackingSource(room, zone)) return <span className="monitor-source-status">Source: Still-based OpenCV tracking</span>;
  const image = monitoringImage(room, zone);
  if (image) return <span className="monitor-source-status" role="status">Source: {image.origin === "generated" ? "Generated still" : "Imported still"}</span>;
  if (zone === "bedroom") return <span className="monitor-source-status" role="status">Source: Not connected</span>;
  return <span className="monitor-source-status" role="status">Source: {recordingSourceLabel(recording, room)}</span>;
}
