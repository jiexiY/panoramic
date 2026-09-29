import { useEffect, useState, useRef, type Dispatch } from "react";
import { BedDouble, Download, Play, ShowerHead, Square } from "lucide-react";
import { routeLevels, type RoutePriority } from "./routeRisk";
import ImportedMonitorImage from "./ImportedMonitorImage";
import { monitoringImage } from "./monitoringImages";
import SuiteTrackingMonitor from "./SuiteTrackingMonitor";
import { trackingSource, type TrackingRun } from "./suiteTracking";
import type { RecordingAction, RecordingState } from "./recordingObservation";

const trackingMedia = {
  gif: "/demo/bathroom-tracking.gif?v=opencv-2",
  still: "/demo/bathroom-tracking-poster.png?v=opencv-2",
};

type Props = {
  room: string;
  priority: RoutePriority;
  recording: RecordingState;
  onRecordingAction: Dispatch<RecordingAction>;
  clearVisible: boolean;
  closed: boolean;
  canReview: boolean;
  onClearFrame: () => void;
  demoEnabled: boolean;
  onTracking: (run: TrackingRun) => void;
};

export default function RoomMonitoring({ room, priority, recording, onRecordingAction, clearVisible, closed, canReview, onClearFrame, demoEnabled, onTracking }: Props) {
  const [dryReference, setDryReference] = useState(false);
  const clearPending = useRef(false);
  useEffect(() => { if (recording.mode === "loading" || recording.mode === "closed") { setDryReference(false); clearPending.current = false; } }, [recording.mode]);
  const playing = recording.mode === "loading" || recording.mode === "playing";
  const mediaError = recording.mode === "error";
  const bedroomImage = monitoringImage(room, "bedroom");
  const bathroomImage = monitoringImage(room, "bathroom");
  const bedroomTracking = trackingSource(room, "bedroom");
  const bathroomTracking = trackingSource(room, "bathroom");

  const level = routeLevels[priority];
  return (
    <article className="room-monitor" aria-label={`Suite ${room} monitoring`}>
      <div className="room-monitor-heading">
        <h2>Suite {room}</h2>
        <span role="status" aria-label={`Suite ${room} monitor: On`}>Monitor: On</span>
      </div>
      <div className="room-monitor-zones">
        <section className="room-monitor-zone" aria-label={`${room} bedroom monitoring`}>
          <div className="room-zone-heading">
            <h3><BedDouble size={16} /> Bedroom monitoring</h3>
          </div>
          {bedroomTracking ? <SuiteTrackingMonitor key={bedroomTracking.stem} source={bedroomTracking} enabled={demoEnabled} onMeasured={onTracking} /> : bedroomImage
            ? <ImportedMonitorImage key={bedroomImage.src} image={bedroomImage} label={`${room} bedroom image data`} />
            : <p className="monitor-source-empty">No monitoring source connected</p>}
        </section>
        <section className="room-monitor-zone" aria-label={`${room} bathroom monitoring`}>
          <div className="room-zone-heading">
            <h3><ShowerHead size={16} /> Bathroom monitoring</h3>
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
                  onLoad={() => { if (dryReference) { if (clearPending.current && canReview) { clearPending.current = false; onClearFrame(); } } else onRecordingAction({ type: "loaded", version: recording.version }); }}
                  onError={() => onRecordingAction({ type: "failed", version: recording.version })}
                  alt={dryReference ? "Original dry bathroom reference, not a verified cleanup" : playing ? "OpenCV tracking playback of annotated bathroom objects and a walking-route concern" : "Bathroom image with annotated objects and a possible water hazard"} />}
                {mediaError && <div className="notice error" role="alert">Bathroom image unavailable. <button className="text-button" onClick={() => onRecordingAction({ type: "close" })}>Retry image</button></div>}
                <details className="evidence-caption">
                  <summary>Image details</summary>
                  <p>Synthetic water image with manually annotated regions. The local workspace starts all configured sources automatically, including this recording. Dashboard displays the previews; Resident Floor holds the map and Panoramic response workflow. Its hazard event enters a browser-local response workflow, not the connected care team's records. The dry reference is the original image, not a live cleanup detection. No external nursing-home system is connected.</p>
                </details>
              </section>
          ) : bathroomTracking ? <SuiteTrackingMonitor key={bathroomTracking.stem} source={bathroomTracking} enabled={demoEnabled} onMeasured={onTracking} /> : bathroomImage
            ? <ImportedMonitorImage key={bathroomImage.src} image={bathroomImage} label={`${room} bathroom image data`} />
            : <p className="monitor-source-empty">No monitoring source connected</p>}
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
