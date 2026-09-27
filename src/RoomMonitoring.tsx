import { useEffect, useState, useRef, type Dispatch } from "react";
import { BedDouble, Download, Play, ShowerHead, Square } from "lucide-react";
import { routeLevels, type RoutePriority } from "./routeRisk";
import ObservationStatus from "./ObservationStatus";
import { recordingIsOn, type RecordingAction, type RecordingState } from "./recordingObservation";

const trackingMedia = {
  gif: "/demo/bathroom-tracking.gif?v=opencv-2",
  still: "/demo/bathroom-tracking-poster.png?v=opencv-2",
};

type Props = {
  room: string;
  priority: RoutePriority;
  active: boolean;
  workflowScanning: boolean;
  recording: RecordingState;
  onRecordingAction: Dispatch<RecordingAction>;
  clearVisible: boolean;
  closed: boolean;
  canReview: boolean;
  onClearFrame: () => void;
};

export default function RoomMonitoring({ room, priority, active, workflowScanning, recording, onRecordingAction, clearVisible, closed, canReview, onClearFrame }: Props) {
  const [dryReference, setDryReference] = useState(false);
  const clearPending = useRef(false);
  useEffect(() => { if (recording.mode === "loading" || recording.mode === "closed") { setDryReference(false); clearPending.current = false; } }, [recording.mode]);
  const playing = recording.mode === "loading" || recording.mode === "playing";
  const mediaError = recording.mode === "error";
  // A saved incident or database subscription is not an active observation source.
  const observing = recordingIsOn(recording, active, room);
  const workflowObserving = active && room === "A101" && workflowScanning;

  const level = routeLevels[priority];
  return (
    <article className="room-monitor" aria-label={`Suite ${room} monitoring`}>
      <div className="room-monitor-heading">
        <h2>Suite {room}</h2>
        <span>Room monitoring</span>
      </div>
      <div className="room-monitor-zones">
        <section className="room-monitor-zone" aria-label={`${room} bedroom monitoring`}>
          <div className="room-zone-heading"><h3><BedDouble size={16} /> Bedroom monitoring</h3></div>
          <p className="monitor-source-empty">No observation source connected</p>
        </section>
        <section className="room-monitor-zone" aria-label={`${room} bathroom monitoring`}>
          <div className="room-zone-heading">
            <h3><ShowerHead size={16} /> Bathroom monitoring</h3>
            <ObservationStatus on={observing || workflowObserving} pending={active && room === "A101" && recording.mode === "loading"} playback />
          </div>
          {room === "A101" ? (
              <section className="facility-evidence" aria-label="Bathroom image data">
                <div className="facility-panel-header">
                  <span>IMAGE DATA</span>
                  <div>
                    <button className="text-button" onClick={() => { setDryReference(false); clearPending.current = false; onRecordingAction({ type: playing ? "pause" : "play" }); }}>
                      {playing ? <Square size={14} /> : <Play size={14} />}{" "}
                      {playing ? "Show still" : "Play tracking"}
                    </button>
                    {canReview && <button className="text-button" disabled={dryReference} onClick={() => { onRecordingAction({type:"pause"}); clearPending.current = true; setDryReference(true); }}>Review dry reference</button>}
                    <a className="text-button" href={trackingMedia.gif} download="panoramic-bathroom-tracking.gif"><Download size={14} /> Download</a>
                  </div>
                </div>
                {!mediaError && <img key={recording.version} className="bathroom-gif" width={1040} height={794}
                  src={dryReference ? "/demo/bathroom-dry-reference.jpg" : playing ? trackingMedia.gif : trackingMedia.still}
                  onLoad={() => { if (dryReference) { if (clearPending.current && active && canReview) { clearPending.current = false; onClearFrame(); } } else onRecordingAction({ type: "loaded", version: recording.version }); }}
                  onError={() => onRecordingAction({ type: "failed", version: recording.version })}
                  alt={dryReference ? "Original dry bathroom reference, not a verified cleanup" : playing ? "OpenCV tracking playback of annotated bathroom objects and a walking-route concern" : "Bathroom image with annotated objects and a possible water hazard"} />}
                {mediaError && <div className="notice error" role="alert">Bathroom image unavailable. <button className="text-button" onClick={() => onRecordingAction({ type: "close" })}>Retry image</button></div>}
                <details className="evidence-caption">
                  <summary>Image details</summary>
                  <p>AI-edited water image with manually annotated regions. Playback sends the recorded hazard event into a browser-local response workflow, not the connected care team's records. The dry reference is the original image, not a live cleanup detection. No external nursing-home system is connected.</p>
                </details>
              </section>
          ) : <p className="monitor-source-empty">No observation source connected</p>}
        </section>
      </div>
      <section className="room-route-concern" aria-label={`${room} route concern`}>
        <div className="room-route-heading">
          <h3>Route concern</h3>
          <span className="room-route-level" style={{ background: closed ? "#e0eddf" : clearVisible ? "#eef0e9" : level.color, color: closed || clearVisible ? "#365641" : level.ink }}>
            {closed ? "Safe · staff confirmed" : clearVisible ? "No hazard visible · check pending" : priority === "unassessed" ? "Not assessed" : level.label}
          </span>
        </div>
        <div className="route-meter" role="meter" aria-label={`${room} route concern level`} aria-valuemin={0} aria-valuemax={3} aria-valuenow={clearVisible || closed ? 0 : level.rank} aria-valuetext={closed ? "Safe, staff confirmed" : clearVisible ? "No hazard visible, safety check pending" : level.label}>
          <div className="facility-scale" aria-hidden="true">{(["away", "near", "crossing"] as const).map(key => <span key={key} style={{ background: routeLevels[key].color }} />)}</div>
          {level.rank > 0 && !clearVisible && !closed && <span className="route-meter-key" style={{left:`${(level.rank - 0.5) / 3 * 100}%`}} aria-hidden="true" />}
        </div>
        <div className="facility-scale-labels"><span>L1 · Off route</span><span>L2 · Near</span><span>L3 · On route</span></div>
      </section>
    </article>
  );
}
