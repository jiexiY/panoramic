import { useEffect, useRef, useState } from "react";
import {
  ScanLine,
  Upload,
  AlertTriangle,
  Sparkles,
  LoaderCircle,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { parseScene, type Analysis } from "./scene";
import RouteOverlay from "./RouteOverlay";
import RoutePlanner from "./RoutePlanner";
import {
  assessRouteHazard,
  highestRoutePriority,
  routeLevels,
  type RoutePoint,
  type WalkingRoute,
} from "./routeRisk";
import { rooms, zones } from "./incidents";
import type { CareTeam } from "./useCareTeam";
import CareTeamPanel from "./CareTeamPanel";
import IncidentDesk from "./IncidentDesk";
import type { SuiteId } from "./suiteRecords";
import "./monitor.css";

export default function SceneMonitor({
  team,
  onSignIn,
  embedded = false,
  activityMode = false,
  scopeRoom,
  onAnalysis,
}: {
  team: CareTeam;
  onSignIn: () => void;
  embedded?: boolean;
  activityMode?: boolean;
  scopeRoom?: SuiteId;
  onAnalysis?: (id: string, zone: string, analysis: Analysis) => void;
}) {
  const [status, setStatus] = useState<{
    configured: boolean;
    model: string;
  } | null>(null);
  const [image, setImage] = useState("");
  const [fileName, setFileName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [frameTime, setFrameTime] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [setupOpen, setSetupOpen] = useState(activityMode);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [room, setRoom] = useState<string>(scopeRoom ?? "A101");
  const [zone, setZone] = useState<string>(activityMode ? "Living area" : "Bathroom");
  const [walkingRoute, setWalkingRoute] = useState<WalkingRoute | null>(null);
  const [routeDraft, setRouteDraft] = useState<RoutePoint[]>([]);
  const [drawingRoute, setDrawingRoute] = useState(false);
  const [savedId, setSavedId] = useState("");
  const [reviewId, setReviewId] = useState("");
  const roomIncidents = team.incidents.filter(i => i.room === (scopeRoom ?? room));
  const reviewTarget = roomIncidents.find(i => i.id === reviewId && i.phase !== "resolved");
  const [recordId, setRecordId] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState<number | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const inFlight = useRef(false);
  const selectionVersion = useRef(0);
  const setupHeading = useRef<HTMLHeadingElement>(null);
  const saved = roomIncidents.find((i) => i.id === savedId);
  const candidate = !!analysis?.scene.observations.some(
    (o) => o.kind !== "object",
  );
  const locked = busy || team.busy;
  const canSaveToTeam = !!team.facility && team.mode !== "playback";
  useEffect(() => {
    if (setupOpen) setupHeading.current?.focus();
  }, [setupOpen]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/gemini", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setStatus(await r.json());
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStatus({ configured: false, model: "" });
      });
    return () => controller.abort();
  }, []);
  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );
  useEffect(
    () => () => {
      selectionVersion.current++;
    },
    [],
  );
  function resetResult() {
    setAnalysis(null);
    setSavedId("");
    setRecordId(crypto.randomUUID());
    setError("");
    setSelected(null);
    setWalkingRoute(reviewTarget?.route ?? null);
    setRouteDraft([]);
    setDrawingRoute(false);
    setPrivacyConfirmed(false);
  }
  function resize(source: CanvasImageSource, width: number, height: number) {
    if (!width || !height) throw new Error("This frame is not ready yet.");
    const scale = Math.min(1, 1280 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }
  async function chooseFile(file?: File) {
    if (!file || locked) return;
    const version = ++selectionVersion.current;
    resetResult();
    setImage("");
    setVideoUrl("");
    setFrameTime(null);
    setFileName("");
    try {
      if (["video/mp4", "video/webm"].includes(file.type)) {
        if (file.size > 80_000_000) throw new Error("Use a video under 80 MB.");
        setVideoUrl(URL.createObjectURL(file));
        setFileName(file.name);
        return;
      }
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 8_000_000
      )
        throw new Error(
          "Choose a JPEG, PNG, or WebP under 8 MB, or MP4/WebM under 80 MB.",
        );
      const bitmap = await createImageBitmap(file);
      try {
        if (version === selectionVersion.current) {
          setImage(resize(bitmap, bitmap.width, bitmap.height));
          setFileName(file.name);
        }
      } finally {
        bitmap.close();
      }
    } catch (e) {
      if (version === selectionVersion.current)
        setError(e instanceof Error ? e.message : "Could not open the file.");
    }
  }
  function captureFrame() {
    if (!video.current || locked) return;
    try {
      video.current.pause();
      const next = resize(
        video.current,
        video.current.videoWidth,
        video.current.videoHeight,
      );
      resetResult();
      setImage(next);
      setFrameTime(video.current.currentTime);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not capture frame.");
    }
  }
  async function saveObservation(value: Analysis) {
    if (reviewId) {
      if (!reviewTarget) throw new Error("This concern is no longer open. Refresh before reviewing it.");
      const row = await team.command("review_observation", {
        id: reviewTarget.id, version: reviewTarget.version, request_id: recordId,
        room, zone, observation: value,
        priority: highestRoutePriority(value.scene.observations, reviewTarget.route),
      });
      setSavedId(row.id);
      return;
    }
    const row = await team.publish(
      {
        id: recordId,
        room,
        zone,
        analysis: value,
        route: walkingRoute,
        mediaName: fileName,
        frameTime,
      },
      image,
    );
    setSavedId(row.id);
  }
  async function request() {
    if (
      inFlight.current ||
      drawingRoute ||
      !privacyConfirmed ||
      !image ||
      !status?.configured ||
      !accessCode
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const version = selectionVersion.current;
    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        signal: AbortSignal.timeout(40000),
        headers: {
          "Content-Type": "application/json",
          "x-demo-access-code": accessCode,
        },
        body: JSON.stringify({
          operation: "analyze",
          stagedOnly: privacyConfirmed,
          image,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Analysis failed.");
      if (
        result.source !== "gemini" ||
        typeof result.model !== "string" ||
        !Number.isFinite(Date.parse(result.analyzedAt))
      )
        throw new Error("Invalid response provenance.");
      if (version !== selectionVersion.current) return;
      const value: Analysis = {
        scene: parseScene(result.scene),
        source: "gemini",
        model: result.model,
        analyzedAt: result.analyzedAt,
      };
      setAnalysis(value);
      onAnalysis?.(recordId, zone, value);
      if (
        (reviewId || value.scene.observations.some((o) => o.kind !== "object")) &&
        canSaveToTeam
      )
        await saveObservation(value);
    } catch (e) {
      if (version === selectionVersion.current)
        setError(
          e instanceof Error && e.name !== "TimeoutError"
            ? e.message
            : "Request timed out. No automatic retry or substitute result was made.",
        );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const retrySave = async () => {
    if (!analysis || locked) return;
    setBusy(true);
    setError("");
    try {
      await saveObservation(analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the concern.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`monitor-page${activityMode ? " activity-scene" : ""}`}>
      {!activityMode && <section className="page-heading">
        {embedded ? <h2>Room data review</h2> : <h1>Living area review</h1>}
      </section>}
      {error && (
        <div className="notice error" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}
      <div className="monitor-grid">
        <div className="scene-column">
          {(!activityMode || image) && <section className="scene-panel" aria-label="Scene review">
            <div className="scene-top">
              <span>ROOM DATA</span>
              {image && <b>{analysis ? "REVIEWED FRAME" : "SELECTED FRAME"}</b>}
            </div>
            <div className={`scene-canvas ${!image ? "empty" : ""}`}>
              {image ? (
                <img src={image} alt="Selected room image" />
              ) : (
                <div className="scene-placeholder">
                  <ScanLine size={48} strokeWidth={1.25} />
                  <h2>No room data</h2>
                  <button
                    className="primary"
                    onClick={() => setSetupOpen(true)}
                  >
                    <Upload size={16} /> Add data
                  </button>
                </div>
              )}
              {image && (
                <RouteOverlay
                  route={walkingRoute}
                  draft={routeDraft}
                  drawing={drawingRoute}
                  observations={analysis?.scene.observations ?? []}
                  onPoint={(point) => {
                    if (!locked)
                      setRouteDraft((points) =>
                        points.length < 12 ? [...points, point] : points,
                      );
                  }}
                />
              )}
              {analysis && image && (
                <div className="detection-layer" aria-hidden="true">
                  {analysis.scene.observations.map((o, i) => {
                    const style =
                      routeLevels[
                        assessRouteHazard(o, drawingRoute ? null : walkingRoute)
                          .priority
                      ];
                    return (
                      <div
                        key={i}
                        className={`detection-box ${o.box[3] > 700 ? "label-right" : ""} ${selected === i ? "selected" : ""}`}
                        style={{
                          top: `${o.box[0] / 10}%`,
                          left: `${o.box[1] / 10}%`,
                          height: `${(o.box[2] - o.box[0]) / 10}%`,
                          width: `${(o.box[3] - o.box[1]) / 10}%`,
                          borderColor:
                            o.kind === "object" ? "#00cf50" : "#ed3232",
                        }}
                      >
                        <span
                          style={{ background: style.color, color: style.ink }}
                        >
                          {i + 1}. {o.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {fileName && (
              <div className="scene-caption">
                <span>
                  {fileName}
                  {frameTime !== null ? ` · ${frameTime.toFixed(1)}s` : ""}
                </span>
                {analysis && (
                  <time>
                    {new Date(analysis.analyzedAt).toLocaleTimeString()}
                  </time>
                )}
              </div>
            )}
          </section>}
          {image && (
            <RoutePlanner
              route={walkingRoute}
              draft={routeDraft}
              drawing={drawingRoute}
              observations={analysis?.scene.observations ?? []}
              disabled={locked || !!analysis || !!reviewId}
              onRoute={setWalkingRoute}
              onDraft={setRouteDraft}
              onDrawing={setDrawingRoute}
            />
          )}
          {setupOpen && (
            <section className="card upload-card">
              <div className="card-title">
                <ImageIcon size={19} />
                <h2 ref={setupHeading} tabIndex={-1}>
                  {activityMode ? `Suite ${scopeRoom} · ${zone} analysis` : "Room image & analysis"}
                </h2>
                {!activityMode && <button
                  className="text-button"
                  aria-label="Close image setup"
                  onClick={() => setSetupOpen(false)}
                >
                  <X size={18} />
                </button>}
              </div>
              <div className="room-targets">
                {team.facility && team.mode !== "playback" && <label className="team-field">Review purpose<select value={reviewId} disabled={locked || !!analysis} onChange={e=>{
                  setReviewId(e.target.value);
                  const target=roomIncidents.find(i=>i.id===e.target.value);
                  if(target) { setRoom(target.room); setZone(target.zone); setWalkingRoute(target.route); } else setWalkingRoute(null);
                }}><option value="">New concern</option>{roomIncidents.filter(i=>i.phase!=="resolved").map(i=><option key={i.id} value={i.id}>Follow up {i.room} · {i.zone}</option>)}</select></label>}
                <label className="team-field">
                  Room
                  <select
                    value={room}
                    disabled={!!scopeRoom || locked || !!analysis || !!reviewId}
                    onChange={(e) => setRoom(e.target.value)}
                  >
                    {(scopeRoom ? [scopeRoom] : rooms).map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label className="team-field">
                  Area
                  <select
                    value={zone}
                    disabled={locked || !!analysis || !!reviewId}
                    onChange={(e) => setZone(e.target.value)}
                  >
                    {zones.map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </label>
              </div>
              <input
                id="room-media"
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                disabled={locked}
                onChange={(e) => {
                  void chooseFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <label className="media-label" htmlFor="room-media">
                Photo (JPEG / PNG / WebP) or video (MP4 / WebM)
              </label>
              {videoUrl && (
                <div className="local-video">
                  <video
                    ref={video}
                    src={videoUrl}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    onError={() =>
                      setError(
                        "This browser could not decode the video. Use an MP4 or still image.",
                      )
                    }
                  />
                  <button
                    className="secondary"
                    disabled={locked}
                    onClick={captureFrame}
                  >
                    <ScanLine size={15} /> Capture paused frame
                  </button>
                  <p className="fine-print">
                    Play or seek to the concern, then capture. Only the captured
                    frame is analyzed, not the full video or audio.
                  </p>
                </div>
              )}
              <label className="check-row privacy-check">
                <input
                  type="checkbox"
                  checked={privacyConfirmed}
                  disabled={locked}
                  onChange={(e) => setPrivacyConfirmed(e.target.checked)}
                />
                <span>
                  <b>
                    This room is unoccupied and contains no identifying
                    information.
                  </b>
                  <small>
                    Analysis sends this frame to Google. Free-tier submissions
                    may be used to improve its products.
                    {canSaveToTeam
                      ? " Candidate hazards and a private frame are saved to your care-team workspace."
                      : ""}
                  </small>
                </span>
              </label>
              {status?.configured && (
                <label className="access-code">
                  Workspace access code
                  <input
                    type="password"
                    autoComplete="off"
                    value={accessCode}
                    disabled={locked}
                    onChange={(e) => setAccessCode(e.target.value)}
                  />
                </label>
              )}
              <button
                className="primary"
                disabled={
                  !image ||
                  !privacyConfirmed ||
                  !status?.configured ||
                  !accessCode ||
                  locked ||
                  drawingRoute ||
                  !!analysis ||
                  (!!team.facility && team.stale)
                }
                onClick={() => void request()}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Sparkles size={17} />
                )}{" "}
                Analyze frame
              </button>
              {!status?.configured && (
                <p className="setup-note">
                  {status
                    ? "Image analysis is currently unavailable."
                    : "Connecting to image analysis…"}
                </p>
              )}
              {canSaveToTeam && (
                <p className="fine-print">
                  A candidate hazard will create a response request for{" "}
                  {team.facility!.name}.
                </p>
              )}
            </section>
          )}
          {image && !setupOpen && (
            <button
              className="secondary"
              disabled={locked}
              onClick={() => setSetupOpen(true)}
            >
              <Upload size={16} /> Room image & analysis
            </button>
          )}
          {analysis && (
            <section className="card observations">
              <div className="card-title">
                <ScanLine size={19} />
                <h2>Observations</h2>
              </div>
              {analysis.scene.observations.map((o, i) => (
                <button
                  key={i}
                  className="observation"
                  onClick={() => setSelected(selected === i ? null : i)}
                >
                  <span className="observation-number">{i + 1}</span>
                  <span>
                    <b>{o.label}</b>
                    <small>{o.evidence}</small>
                  </span>
                </button>
              ))}
              {!candidate && (
                <p>No candidate hazards identified in this frame.</p>
              )}
              <details className="uncertainty">
                <summary>Analysis notes</summary>
                <p>{analysis.scene.uncertainty}</p>
              </details>
            </section>
          )}
        </div>
        {activityMode && analysis && <div className="activity-analysis-result" role="status">
          <p>Analysis added to Activity. {savedId ? "Response saved to the care-team record." : candidate || reviewId ? "The response has not been saved to the care team." : "No candidate hazard was identified in this frame; this is not a safety clearance."}</p>
          {(candidate || reviewId) && !savedId && canSaveToTeam && <button className="secondary" disabled={locked || team.stale || !privacyConfirmed} onClick={() => void retrySave()}>Save response to care team</button>}
          {!canSaveToTeam && candidate && <button className="text-button" onClick={onSignIn}>Sign in to connect a care-team workspace</button>}
        </div>}
        {!activityMode && <aside className="response-column" aria-label="Caregiver response">
          <CareTeamPanel team={team} onSignIn={onSignIn} />
          {analysis && reviewId && !savedId && <button className="secondary full" disabled={locked || team.stale} onClick={() => void retrySave()}>Retry saving follow-up</button>}
          {saved ? (
            <IncidentDesk key={saved.id} team={team} incident={saved} />
          ) : (
            <section className="card share-review">
              <span className="eyebrow">RESPONSE STATUS</span>
              <h2>
                {candidate ? "Concern ready to send" : "No open response"}
              </h2>
              {candidate ? (
                <>
                  <p>{analysis?.scene.brief}</p>
                  <button
                    className="primary"
                    disabled={
                      locked ||
                      !team.facility ||
                      team.stale ||
                      !privacyConfirmed
                    }
                    onClick={() => void retrySave()}
                  >
                    Send concern to care team
                  </button>
                  {!team.facility && (
                    <p className="fine-print">
                      Connect a care-team workspace to save and deliver this
                      concern.
                    </p>
                  )}
                </>
              ) : (
                <p className="team-empty">
                  {analysis ? "Scene reviewed." : "No activity yet"}
                </p>
              )}
            </section>
          )}
        </aside>}
      </div>
    </div>
  );
}
