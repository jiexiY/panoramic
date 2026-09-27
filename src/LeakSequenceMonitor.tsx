import { useEffect, useRef, useState } from "react";
import { parseLeakSequence, type LeakSequence } from "./leakSequence";

export default function LeakSequenceMonitor({ enabled, onStep }: { enabled: boolean; onStep: (sequence: LeakSequence, index: number) => void }) {
  const [sequence, setSequence] = useState<LeakSequence | null>(null);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const callback = useRef(onStep); callback.current = onStep;
  const reported = useRef(new Set<number>());
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setSequence(null); setIndex(0); setLoaded(-1);
    fetch("/demo/a104-leak-analysis.json", { signal: controller.signal }).then(r => { if (!r.ok) throw new Error("Measurements unavailable"); return r.json(); }).then(data => setSequence(parseLeakSequence(data))).catch(e => { if (e.name !== "AbortError") setError("Leak demo measurements unavailable. No safety conclusion."); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!sequence || loaded !== index || !enabled || error) return;
    if (!reported.current.has(index)) { reported.current.add(index); callback.current(sequence, index); }
    if (paused || index === sequence.steps.length - 1) return;
    const timer = setTimeout(() => { setLoaded(-1); setIndex(i => i + 1); }, sequence.steps[index].duration_ms);
    return () => clearTimeout(timer);
  }, [sequence, index, loaded, paused, enabled, error]);
  const step = sequence?.steps[index];
  return <section className="facility-evidence" aria-label="A104 OpenCV leak sequence">
    <div className="facility-panel-header"><span>GOOGLE STUDIO · SYNTHETIC STEPS</span><div>
      <button className="text-button" disabled={!step || !!error} onClick={() => { if (index === 3) { setIndex(0); setLoaded(-1); setPaused(false); } else setPaused(p => !p); }}>{index === 3 ? "Replay sequence" : paused ? "Play sequence" : "Pause preview"}</button>
      <a className="text-button" href="/demo/a104-water-leak-opencv.gif" download>Download GIF</a>
    </div></div>
    {error ? <p className="notice error" role="alert">{error} <button className="text-button" onClick={() => setRetry(n => n + 1)}>Retry sequence</button></p> : step ? <img key={`${retry}:${index}`} className="monitor-still-image" src={step.image} width={sequence.width} height={sequence.height} alt={`A104 synthetic leak step ${index + 1} of 4 with measured OpenCV floor-change contours and a human-marked route`} onLoad={() => setLoaded(index)} onError={() => setError("Leak frame unavailable. Preview stopped; existing concerns stay open.")} /> : <p className="monitor-source-empty">Loading OpenCV measurements…</p>}
    <p className="evidence-caption" role="status">{step && loaded === index ? `Step ${index + 1}/4 · ${step.tracking.feature_count} feature tracks · ${step.changed_pixels.toLocaleString()} changed floor pixels · ${step.route_overlap_pixels.toLocaleString()} route-overlap pixels` : "Waiting for the source frame"}</p>
    <details className="evidence-caption"><summary>How this demo works</summary><p>Four Google Studio images assembled into a step-by-step sequence. OpenCV runs locally offline to align frames, follow stable fixture features with persistent IDs, and measure appearance changes within a human-marked floor area. Tracks follow the surroundings, not individual water particles. It is not a water classifier or a live camera. The app reads those saved measurements after each frame loads; only A104 receives the resulting demo concern. Replay does not clear it. This sequence contains no verified cleanup.</p><a href="/demo/a104-leak-analysis.json" download>Download OpenCV measurements</a> · <a href="/demo/a104-water-leak.gif" download>Download unannotated GIF</a></details>
  </section>;
}
