import { useState } from "react";
import { Download } from "lucide-react";
import type { MonitoringImage } from "./monitoringImages";

// Intentionally has no workflow callbacks: image availability is not hazard detection.
export default function ImportedMonitorImage({ image, label }: { image: MonitoringImage; label: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  return <section className="facility-evidence imported-monitor-image" aria-label={label}>
    <div className="facility-panel-header">
      <span>{image.origin === "generated" ? "SYNTHETIC STILL" : "STILL IMAGE"}</span>
      <a className="text-button" href={image.src} download><Download size={14} /> Download</a>
    </div>
    {status === "loading" && <p className="monitor-image-message" role="status">Loading image…</p>}
    {status !== "error" && <img key={attempt} className="monitor-still-image"
      src={image.src} width={image.width} height={image.height} alt={image.alt}
      onLoad={() => setStatus("loaded")} onError={() => setStatus("error")} />}
    {status === "error" && <div className="notice error" role="alert">
      Image unavailable. <button className="text-button" onClick={() => { setStatus("loading"); setAttempt(value => value + 1); }}>Retry image</button>
    </div>}
    <details className="evidence-caption">
      <summary>Image details</summary>
      <p>{image.details}</p>
    </details>
  </section>;
}
