import { useEffect, useRef, useState } from "react";
import { parseTrackingRun, type TrackingRun, type TrackingSource } from "./suiteTracking";

export default function SuiteTrackingMonitor({ source, enabled, onMeasured }: { source: TrackingSource; enabled: boolean; onMeasured: (run: TrackingRun) => void }) {
  const [run, setRun] = useState<TrackingRun | null>(null);
  const [loaded, setLoaded] = useState("");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(true);
  const [retry, setRetry] = useState(0);
  const reported = useRef(false);
  const callback = useRef(onMeasured); callback.current = onMeasured;
  const media = run ? `${playing && enabled ? run.gif : run.poster}?v=route-mix-3` : "";
  useEffect(() => {
    const controller = new AbortController();
    setRun(null); setError(""); setLoaded("");
    fetch(`/demo/${source.stem}.json?v=route-mix-3`, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error("Measurements unavailable"); return r.json(); }).then(data => {
      if (!controller.signal.aborted) setRun(parseTrackingRun(data, source));
    }).catch(e => { if (e.name !== "AbortError") setError("Tracking measurements unavailable. No safety conclusion."); });
    return () => controller.abort();
  }, [source, retry]);
  useEffect(() => {
    if (!run || !enabled || !media || loaded !== media || error || reported.current) return;
    // Reveal the saved offline result after the first build-up, never per loop.
    // Showing the settled poster explicitly also reveals that measured result.
    const timer = setTimeout(() => {
      if (reported.current) return;
      reported.current = true;
      callback.current(run);
    }, playing ? run.resultDelayMs : 0);
    return () => clearTimeout(timer);
  }, [run, enabled, loaded, media, error, playing]);
  return <section className="facility-evidence" aria-label={`${source.room} ${source.zone} OpenCV tracking`}>
    <div className="facility-panel-header"><span>{source.heading ?? "OPENCV · REGION TRACKING"}</span><div>
      <button className="text-button" disabled={!run || !!error} onClick={() => setPlaying(p => !p)}>{playing ? "Show result" : "Replay tracking"}</button>
      <a className="text-button" href={`/demo/${source.stem}.gif?v=route-mix-3`} download>Download GIF</a>
    </div></div>
    {error ? <p className="notice error" role="alert">{error} <button className="text-button" onClick={() => setRetry(n => n + 1)}>Retry tracking</button></p> : run ?
      <img key={`${retry}:${media}`} className="monitor-still-image" src={media} width={run.width} height={run.height} alt={`${source.room} ${source.zone}: ${playing ? "looping OpenCV preview from clean source to feature tracks, regions, route and settled result" : "settled OpenCV tracking result"}${source.description ? ". " + source.description : ""}`} onLoad={() => setLoaded(media)} onError={() => { setLoaded(""); setError("Tracking image unavailable. Existing concerns stay open."); }} /> : <p className="monitor-source-empty">Loading measured tracks…</p>}
    {run && !error && loaded === media && <div className="tracking-summary" role="status">
      <span>{playing ? "12-second loop · " : "Settled result · "}{run.minTracks}+ feature tracks · {run.frames} frames · max median fit {run.maxError.toFixed(3)} px</span>
      <div className="tracking-region-list">{run.regions.map((r, index) => <span key={r.id}>ID {String(index + 1).padStart(2, "0")} · {r.label}</span>)}</div>
    </div>}
    {source.description && <p className="evidence-caption">{source.description}</p>}
    <details className="evidence-caption"><summary>Tracking details</summary><p>The preview starts clean, reveals feature tracks, fixture regions and the route, then holds its result for three seconds before repeating. OpenCV follows measured feature points and keeps stable region IDs. The object labels, candidate hazards and walking route were marked manually. Camera motion is simulated from a still image, not a live feed or evidence that the table, basket, rug or fixtures moved. Saved measurements feed only this suite and zone’s local report; looping never clears or duplicates a concern. Unmarked rooms are not certified safe.</p><a href={`/demo/${source.stem}.json?v=route-mix-3`} download>Download per-frame tracks</a></details>
  </section>;
}
