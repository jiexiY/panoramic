export type RecordingState = {
  mode: "closed" | "loading" | "playing" | "still" | "error";
  version: number;
};
export type RecordingAction =
  | { type: "play" | "pause" | "close" }
  | { type: "loaded" | "failed"; version: number };

export const initialRecording: RecordingState = { mode: "closed", version: 0 };

export function recordingReducer(state: RecordingState, action: RecordingAction): RecordingState {
  if (action.type === "play") return { mode: "loading", version: state.version + 1 };
  if (action.type === "close") return { mode: "closed", version: state.version + 1 };
  if (action.type === "pause") {
    return state.mode === "playing" || state.mode === "loading"
      ? { mode: "still", version: state.version + 1 } : state;
  }
  // The default still remains visible even when playback is closed. Ignore replaced images.
  if (!("version" in action) || action.version !== state.version) return state;
  if (action.type === "failed") return { ...state, mode: "error" };
  return state.mode === "loading" ? { ...state, mode: "playing" } : state;
}

export function recordingIsOn(state: RecordingState, active: boolean, room: string): boolean {
  return active && room === "A101" && state.mode === "playing";
}

export function recordingSourceLabel(state: RecordingState, room: string): string {
  if (room !== "A101") return "Not connected";
  if (state.mode === "error") return "Unavailable";
  if (state.mode === "loading") return "Loading recording…";
  return state.mode === "playing" ? "Recorded data" : "Still image";
}
