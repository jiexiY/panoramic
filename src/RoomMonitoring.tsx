import { useEffect, useRef, useState } from "react";
import { BedDouble, Download, Play, ShowerHead, Square, X } from "lucide-react";
import { routeLevels, type RoutePriority } from "./routeRisk";
import ObservationStatus from "./ObservationStatus";

const trackingMedia = {
  gif: "/demo/bathroom-tracking.gif?v=opencv-2",
  still: "/demo/bathroom-tracking-poster.png?v=opencv-2",
};

type Props = {
  room: string;
  priority: RoutePriority;
  active: boolean;
  workflowScanning: boolean;
  onObservationChange: (on: boolean) => void;
};

export default function RoomMonitoring({ room, priority, active, workflowScanning, onObservationChange }: Props) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const recordingRef = useRef<HTMLElement>(null);
  // A saved incident or database subscription is not an active observation source.
  const observing = active && room === "A101" && evidenceOpen && playing && mediaReady && !mediaError;
  const workflowObserving = active && room === "A101" && workflowScanning;

  useEffect(() => {
    onObservationChange(observing);
    return () => onObservationChange(false);
  }, [observing, onObservationChange]);
  useEffect(() => { if (!active) setPlaying(false); }, [active]);
  useEffect(() => {
    if (evidenceOpen) recordingRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "nearest",
    });
  }, [evidenceOpen]);

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
        <section ref={recordingRef} className="room-monitor-zone" aria-label={`${room} bathroom monitoring`}>
          <div className="room-zone-heading">
            <h3><ShowerHead size={16} /> Bathroom monitoring</h3>
            <ObservationStatus on={observing || workflowObserving} playback />
          </div>
          {room === "A101" ? (
            <>
              {!evidenceOpen && <button className="secondary room-recording-button" onClick={() => {
                setMediaReady(false);
                setMediaError(false);
                setEvidenceOpen(true);
                setPlaying(true);
              }}><Play size={15} /> Open bathroom recording</button>}
              {evidenceOpen && <section className="facility-evidence" aria-label="Bathroom recording">
                <div className="facility-panel-header">
                  <span>RECORDING REVIEW</span>
                  <div>
                    <button className="text-button" onClick={() => {
                      setMediaReady(false);
                      setMediaError(false);
                      setPlaying(!playing);
                    }}>
                      {playing ? <Square size={14} /> : <Play size={14} />}{" "}
                      {playing ? "Show still" : "Play tracking"}
                    </button>
                    <a className="text-button" href={trackingMedia.gif} download="panoramic-bathroom-tracking.gif"><Download size={14} /> Download</a>
                    <button className="text-button" aria-label="Close recording" onClick={() => {
                      setEvidenceOpen(false);
                      setPlaying(false);
                      setMediaReady(false);
                    }}><X size={16} /></button>
                  </div>
                </div>
                <img className="bathroom-gif" width={1040} height={794}
                  src={playing ? trackingMedia.gif : trackingMedia.still}
                  onLoad={() => setMediaReady(true)}
                  onError={() => { setMediaError(true); setMediaReady(false); }}
                  alt="OpenCV tracking playback of annotated bathroom objects and a walking-route concern" />
                {mediaError && <p className="notice error" role="alert">Recording unavailable. Close and reopen it to try again.</p>}
                <details className="evidence-caption">
                  <summary>Recording details</summary>
                  <p>Image-based playback with an AI-edited source image and manually annotated regions. OpenCV tracks their movement. Opening this recording does not create a care-team alert.</p>
                </details>
              </section>}
            </>
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
