import { suiteIds, type SuiteId } from "./suiteRecords.ts";
import { initialRecording, recordingReducer, type RecordingAction, type RecordingState } from "./recordingObservation.ts";

type SuiteMonitor = { enabled: true; source: "recording" | "tracking" | null; recording: RecordingState };
export type FloorMonitoring = Record<SuiteId, SuiteMonitor>;
type FloorAction = { type: "start" } | { type: "recording"; room: SuiteId; action: RecordingAction };

// Monitoring is floor-wide. Source availability and preview state belong to each suite.
// A101 keeps its bathroom recording; the other suites use still-based LK tracks.
// A104's bathroom tracks only dry fixtures; its leak sequence is retired.
// Loading a plain still never emits detection events.
export function initialFloorMonitoring(): FloorMonitoring {
  return Object.fromEntries(suiteIds.map(room => [room, {
    enabled: true, source: room === "A101" ? "recording" : "tracking", recording: { ...initialRecording },
  }])) as FloorMonitoring;
}

export function floorMonitoringReducer(state: FloorMonitoring, action: FloorAction): FloorMonitoring {
  if (action.type === "start") {
    let next = state;
    for (const room of suiteIds) {
      const monitor = state[room];
      if (monitor.enabled && monitor.source === "recording" && monitor.recording.mode === "closed") {
        next = { ...next, [room]: { ...monitor, recording: recordingReducer(monitor.recording, { type: "play" }) } };
      }
    }
    return next;
  }
  const monitor = state[action.room];
  if (!monitor?.enabled || monitor.source !== "recording") return state;
  const recording = recordingReducer(monitor.recording, action.action);
  return recording === monitor.recording ? state : { ...state, [action.room]: { ...monitor, recording } };
}
