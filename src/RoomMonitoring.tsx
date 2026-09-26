import { type Dispatch } from "react";
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
};

export default function RoomMonitoring({ room, priority, active, workflowScanning, recording, onRecordingAction }: Props) {
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
                    <button className="text-button" onClick={() => onRecordingAction({ type: playing ? "pause" : "play" })}>
                      {playing ? <Square size={14} /> : <Play size={14} />}{" "}
                      {playing ? "Show still" : "Play tracking"}
                    </button>
                    <a className="text-button" href={trackingMedia.gif} download="panoramic-bathroom-tracking.gif"><Download size={14} /> Download</a>
                  </div>
                </div>
                {!mediaError && <img key={recording.version} className="bathroom-gif" width={1040} height={794}
                  src={playing ? trackingMedia.gif : trackingMedia.still}
                  onLoad={() => onRecordingAction({ type: "loaded", version: recording.version })}
                  onError={() => onRecordingAction({ type: "failed", version: recording.version })}
                  alt={playing ? "OpenCV tracking playback of annotated bathroom objects and a walking-route concern" : "Bathroom image with annotated objects and a possible water hazard"} />}
                {mediaError && <div className="notice error" role="alert">Bathroom image unavailable. <button className="text-button" onClick={() => onRecordingAction({ type: "close" })}>Retry image</button></div>}
                <details className="evidence-caption">
                  <summary>Image details</summary>
                  <p>AI-edited source image with manually annotated regions. OpenCV tracks their movement in image-based playback. Viewing the image or playing the recording does not create a care-team alert.</p>
                </details>
              </section>
          ) : <p className="monitor-source-empty">No observation source connected</p>}
        </section>
      </div>
      <section className="room-route-concern" aria-label={`${room} route concern`}>
        <div className="room-route-heading">
          <h3>Route concern</h3>
          <span className="room-route-level" style={{ background: level.color, color: level.ink }}>
            {priority === "unassessed" ? "Not assessed" : level.label}
          </span>
        </div>
        <div className="facility-scale" aria-hidden="true">
          {(["away", "near", "crossing"] as const).map(key => <span key={key} style={{ background: routeLevels[key].color }} />)}
        </div>
        <div className="facility-scale-labels"><span>L1 · Off route</span><span>L2 · Near</span><span>L3 · On route</span></div>
      </section>
    </article>
  );
}
