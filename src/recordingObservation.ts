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
  // Ignore callbacks from an image that was closed, paused or replaced.
  if (!("version" in action) || action.version !== state.version || state.mode === "closed") return state;
  if (action.type === "failed") return { ...state, mode: "error" };
  return state.mode === "loading" ? { ...state, mode: "playing" } : state;
}

export function recordingIsOn(state: RecordingState, active: boolean, room: string): boolean {
  return active && room === "A101" && state.mode === "playing";
}
