import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Cloud,
  CloudOff,
  Download,
  HandHeart,
  HeartHandshake,
  History,
  Info,
  LoaderCircle,
  LockKeyhole,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  AlertTriangle,
  LogIn,
  BookOpen,
} from "lucide-react";
import {
  CHECKS,
  emptyState,
  initialState,
  transition,
  missing,
  ready,
  supportAvailable,
  openHelp,
  report,
  type State,
  type Action,
} from "./workflow";
import {
  cloud,
  connectGuest,
  createSession,
  listSessions,
  saveSession,
  type Row,
} from "./cloud";
import "./style.css";
import SceneMonitor from "./SceneMonitor";
import SiteLink, { type Navigate } from "./SiteLink";
import { workspacePaths, type WorkspacePage } from "./routes";

const time = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
const date = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
export default function Workspace({ page, navigate }: { page: WorkspacePage; navigate: Navigate }) {
  const setPage = (next: WorkspacePage) => navigate(workspacePaths[next]);
  const [state, setState] = useState<State>(() => emptyState());
  const hasSession = state.events.length > 0;
  const [row, setRow] = useState<Row | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const working = useRef(false);
  const modalRef = useRef<HTMLElement>(null);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const heading = [...document.querySelectorAll<HTMLElement>('[data-active-page="true"] .app-shell h1')].find(item => item.getClientRects().length > 0);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [page]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!cloud) {
        setRestoring(false);
        return;
      }
      try {
        const { data, error: authError } = await cloud.auth.getSession();
        if (authError) throw authError;
        if (data.session && active) {
          setOwner(data.session.user.id);
          const saved = await listSessions();
          if (active) {
            setRows(saved);
            if (saved[0]) {
              setRow(saved[0]);
              setState(saved[0].snapshot);
            }
          }
        }
      } catch {
        if (active)
          setError(
            "Could not restore your cloud session. Your local walkthrough is available; cloud records have not been loaded.",
          );
      } finally {
        if (active) setRestoring(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!authOpen && !newOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () =>
      Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]",
        ) ?? [],
      );
    controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !working.current) {
        setAuthOpen(false);
        setNewOpen(false);
      }
      if (event.key !== "Tab") return;
      const list = controls(),
        first = list[0],
        last = list.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [authOpen, newOpen]);
  async function run(job: () => Promise<void>) {
    if (working.current || restoring) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await job();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save. Your last action was not applied.",
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function putRow(saved: Row) {
    setRow(saved);
    setState(saved.snapshot);
    setRows((current) =>
      [saved, ...current.filter((r) => r.id !== saved.id)].slice(0, 30),
    );
  }
  const act = (action: Action) =>
    run(async () => {
      if (!hasSession) return;
      const next = transition(state, action);
      if (row) {
        if (!navigator.onLine)
          throw new Error(
            "You are offline. This action was not saved. Do not rely on this prototype for care or emergencies.",
          );
        putRow(await saveSession(row, next));
      } else setState(next);
    });
  const connect = () =>
    run(async () => {
      if (!hasSession) return;
      const user = await connectGuest();
      setOwner(user.id);
      const saved = await createSession(state, user.id);
      putRow(saved);
      setNotice(
        "Connected. Fictional session saved to Supabase and isolated to your authenticated identity.",
      );
    });
  const refresh = () =>
    run(async () => {
      const saved = await listSessions();
      setRows(saved);
      const current = saved.find((s) => s.id === row?.id);
      if (current) putRow(current);
      else if (row) {
        setRow(null);
        setState(emptyState());
        setNotice(
          "The selected cloud record no longer exists.",
        );
      }
    });
  const newSession = (scenario: "one" | "two") =>
    run(async () => {
      const next = initialState(scenario);
      if (owner) putRow(await createSession(next, owner));
      else {
        setRow(null);
        setState(next);
      }
      setNewOpen(false);
      setPage("session");
    });
  const download = () => {
    const blob = new Blob([report(state)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `panoramic-fictional-handoff-${row?.id.slice(0, 8) ?? "local"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const completedChecks = CHECKS.filter(([key]) => state.checks[key]).length;
  const ended = ["complete", "declined"].includes(state.phase);
  const support = state.phase === "support";
  const warning = missing(state);
  const stage = state.phase === "prepare" ? 0 : support ? 1 : 2;
  const progressStage = state.phase === "declined" ? -1 : stage;
  const confirm = (
    key:
      "planReviewed" | "caregiver" | "helper" | "coverage" | "consent" | "exit",
  ) => act({ type: "confirm", key, value: !state[key] });
  const supportChecks = (
    <div className="support-checks">
      <label className="check-row">
        <input
          type="checkbox"
          checked={state.planReviewed}
          disabled={busy || (!support && state.phase !== "prepare")}
          onChange={() => confirm("planReviewed")}
        />
        <span>
          <b>Assessed plan reviewed</b>
          <small>Requirements come from a professional plan—not AI.</small>
        </span>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={state.caregiver}
          disabled={busy || (!support && state.phase !== "prepare")}
          onChange={() => confirm("caregiver")}
        />
        <span>
          <b>Alex · primary caregiver present</b>
          <small>Human-confirmed, awake and available.</small>
        </span>
      </label>
      {state.scenario === "two" && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={state.helper}
            disabled={busy || (!support && state.phase !== "prepare")}
            onChange={() => confirm("helper")}
          />
          <span>
            <b>Sam · second helper present</b>
            <small>Physically here. Being on call does not count.</small>
          </span>
        </label>
      )}
      <label className="check-row">
        <input
          type="checkbox"
          checked={state.coverage}
          disabled={busy || (!support && state.phase !== "prepare")}
          onChange={() => confirm("coverage")}
        />
        <span>
          <b>Backup & other-resident coverage confirmed</b>
          <small>
            {state.shift === "night" ? "Awake night coverage" : "Day coverage"}{" "}
            agreed with Jordan, the fictional supervisor.
          </small>
        </span>
      </label>
    </div>
  );
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to workspace
      </a>
      <aside className="rail">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <span>Panoramic</span>
        </a>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          <button aria-current={page === "monitor" ? "page" : undefined} onClick={() => setPage("monitor")}>
            <Sparkles size={18} /> Scene review
          </button>
          <button
            aria-current={page === "session" ? "page" : undefined}
            onClick={() => setPage("session")}
          >
            <HandHeart size={18} /> Care session
          </button>
          <button
            aria-current={page === "history" ? "page" : undefined}
            onClick={() => {
              setPage("history");
              if (owner) void refresh();
            }}
          >
            <History size={18} /> Session history{" "}
            <span className="count">{rows.length}</span>
          </button>
        </nav>
        <div className="rail-bottom">
          <SiteLink to="/" navigate={navigate}><ArrowLeft size={13} /> Back to start</SiteLink>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <ChevronRight size={14} />
            <b>
              {page === "monitor" ? "Scene review" : page === "session"
                ? "Care session"
                : "Session history"}
            </b>
          </div>
          <div className="top-actions">
            {(hasSession || busy) && <span className={`connection ${row ? "connected" : ""}`}>
              {busy ? (
                <LoaderCircle className="spin" size={14} />
              ) : row ? (
                <Cloud size={15} />
              ) : (
                <CloudOff size={15} />
              )}{" "}
              {busy
                ? "Saving…"
                : row
                  ? "Supabase connected"
                  : "Local session"}
            </span>}
            {!owner && (
              <button className="text-button" onClick={() => setAuthOpen(true)}>
                <LogIn size={16} /> Sign in
              </button>
            )}
          </div>
        </header>
        <main id="main">
          {error && (
            <div className="notice error" role="alert">
              <AlertTriangle size={20} />
              <span>{error}</span>
              {owner && (
                <button onClick={refresh} disabled={busy}>
                  Reload saved session
                </button>
              )}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <Check size={18} />
              <span>{notice}</span>
              <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!online && (
            <div className="notice error" role="alert">
              Offline. Cloud actions are unavailable. Use established care and
              emergency procedures—not this app.
            </div>
          )}
          <div hidden={page !== "monitor"}><SceneMonitor /></div>
          {page === "session" && !hasSession && <>
            <section className="page-heading"><h1>Care session</h1></section>
            <section className="card session-empty"><HandHeart size={34} /><h2>No care session yet</h2><button className="primary" onClick={() => setNewOpen(true)} disabled={busy || restoring}><Plus size={17} /> New demo session</button></section>
          </>}
          {page === "session" && hasSession && (
            <>
              <section className="page-heading">
                <div>
                  <p className="eyebrow">BATHING SUPPORT</p>
                  <h1>Care session</h1>
                  <p className="intro">
                    Complete room checks, confirm available support, and record the session.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setNewOpen(true)}
                  disabled={busy}
                >
                  <Plus size={17} /> New demo session
                </button>
              </section>
              <div className="demo-note">
                <span className="pill">DEMO</span>
                <p>
                  All residents and caregivers below are fictional. No sensors,
                  AI review in this care-session flow, or emergency dispatch are connected.
                </p>
              </div>
              <div className="session-grid">
                <div className="flow-column">
                  <section className="resident-strip">
                    <div className="resident-avatar">
                      EM
                      <span />
                    </div>
                    <div>
                      <p className="eyebrow">TODAY’S FICTIONAL SESSION</p>
                      <h2>Evelyn M.</h2>
                      <p>
                        {state.scenario === "two"
                          ? "Two-person assistance plan"
                          : "One-person assistance plan"}{" "}
                        <span>·</span> Bathing routine
                      </p>
                    </div>
                    <span
                      className={`phase-pill ${state.phase === "declined" ? "amber" : ""}`}
                    >
                      {state.phase === "prepare"
                        ? "Preparing"
                        : state.phase === "support"
                          ? state.paused
                            ? "Paused"
                            : "In progress"
                          : state.phase === "declined"
                            ? "Declined"
                            : state.phase === "complete"
                              ? row
                                ? "Handoff saved"
                                : "Handoff closed locally"
                              : "Review handoff"}
                    </span>
                  </section>
                  <ol className="steps" aria-label="Workflow progress">
                    {["Prepare", "Support", "Handoff"].map((label, i) => (
                      <li
                        key={label}
                        className={
                          progressStage === i
                            ? "active"
                            : progressStage > i
                              ? "done"
                              : ""
                        }
                        aria-current={progressStage === i ? "step" : undefined}
                      >
                        <span>
                          {progressStage > i ? (
                            <Check size={14} />
                          ) : (
                            `0${i + 1}`
                          )}
                        </span>
                        <b>{label}</b>
                      </li>
                    ))}
                  </ol>
                  {state.phase === "prepare" && (
                    <section className="card preparation">
                      <div className="card-title">
                        <div className="section-icon">
                          <ClipboardList size={21} />
                        </div>
                        <div>
                          <h2>Room preparation</h2>
                          <p>
                            Confirm in person. Unknown is not the same as
                            checked.
                          </p>
                        </div>
                        <span className="progress-text">
                          {completedChecks}/{CHECKS.length}
                        </span>
                      </div>
                      <div className="progress-track">
                        <i
                          style={{
                            width: `${(completedChecks / CHECKS.length) * 100}%`,
                          }}
                        />
                      </div>
                      <fieldset className="room-checks" disabled={busy}>
                        <legend className="sr-only">
                          Room preparation checks
                        </legend>
                        {CHECKS.map(([key, title, detail]) => (
                          <label
                            className={`check-row ${state.checks[key] ? "checked" : ""}`}
                            key={key}
                          >
                            <input
                              type="checkbox"
                              checked={state.checks[key]}
                              onChange={(e) =>
                                act({
                                  type: "check",
                                  key,
                                  value: e.target.checked,
                                })
                              }
                            />
                            <span>
                              <b>{title}</b>
                              <small>{detail}</small>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                      <div className="choice-box">
                        <HandHeart size={23} />
                        <div>
                          <h3>Resident consent</h3>
                          <p>
                            Ask whether Evelyn wants to begin. A “no” ends this
                            routine.
                          </p>
                          <div className="button-row">
                            <button
                              className={
                                state.consent ? "consent selected" : "consent"
                              }
                              aria-pressed={state.consent}
                              onClick={() => confirm("consent")}
                              disabled={busy}
                            >
                              {state.consent && <Check size={14} />} Agrees to
                              begin
                            </button>
                            <button
                              className="text-button"
                              onClick={() => act({ type: "decline" })}
                              disabled={busy}
                            >
                              Declines today
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="card-footer">
                        <span>
                          {ready(state)
                            ? "Required confirmations recorded. Not clinical clearance."
                            : "Confirm the room, their choice, and available support."}
                        </span>
                        <button
                          className="primary"
                          disabled={busy || !ready(state)}
                          onClick={() => act({ type: "start" })}
                        >
                          Begin support <ArrowRight size={17} />
                        </button>
                      </div>
                    </section>
                  )}
                  {support && (
                    <section className="card">
                      <div className="card-title">
                        <div className="section-icon">
                          <HandHeart size={23} />
                        </div>
                        <div>
                          <h2>
                            {state.paused
                              ? "Pause. Make space for a human decision."
                              : "Stay present. Keep their choice central."}
                          </h2>
                          <p>
                            Follow the assessed care plan. This app does not
                            direct physical transfers.
                          </p>
                        </div>
                      </div>
                      <div
                        className={`support-status ${state.paused ? "is-paused" : ""}`}
                      >
                        {state.paused ? (
                          <Pause size={30} />
                        ) : (
                          <HeartHandshake size={32} />
                        )}
                        <div>
                          <h3>
                            {state.paused
                              ? "Workflow paused"
                              : "Caregiver support in progress"}
                          </h3>
                          <p>
                            {state.paused
                              ? "Do not leave the person unattended to use this interface. Urgent help comes before documentation."
                              : "There is no automatic timer, camera, or machine deciding when to continue."}
                          </p>
                        </div>
                      </div>
                      <div className="button-row control-row">
                        {!state.paused ? (
                          <button
                            className="secondary"
                            onClick={() => act({ type: "pause" })}
                            disabled={busy}
                          >
                            <Pause size={17} /> Pause routine
                          </button>
                        ) : (
                          <button
                            className="secondary"
                            onClick={() => act({ type: "resume" })}
                            disabled={
                              busy ||
                              !state.consent ||
                              !supportAvailable(state) ||
                              openHelp(state) ||
                              state.concern
                            }
                          >
                            <Play size={17} /> Confirm reassessment & resume
                          </button>
                        )}
                        <button
                          className="help-button"
                          disabled={busy || openHelp(state)}
                          onClick={() => act({ type: "request" })}
                        >
                          <CircleHelp size={17} /> Record help request
                        </button>
                      </div>
                      <div className="button-row">
                        <button
                          className="text-button"
                          disabled={busy || !state.consent}
                          onClick={() => act({ type: "withdraw" })}
                        >
                          Person asks to stop
                        </button>
                        {!state.consent && (
                          <span className="form-error">
                            Consent withdrawn. Do not resume; arrange the
                            supported exit.
                          </span>
                        )}
                      </div>
                      <div className="help-note">
                        <Info size={15} />
                        <span>
                          This records a demo request only. It does not call a
                          caregiver or emergency services.
                        </span>
                      </div>
                      {state.help !== "none" && (
                        <div className="help-flow">
                          <h3>Assistance request</h3>
                          <ol>
                            {[
                              "requested",
                              "acknowledged",
                              "arrived",
                              "resolved",
                            ].map((step, i) => (
                              <li
                                key={step}
                                className={
                                  [
                                    "requested",
                                    "acknowledged",
                                    "arrived",
                                    "resolved",
                                  ].indexOf(state.help) >= i
                                    ? "done"
                                    : ""
                                }
                              >
                                <span>{i + 1}</span>
                                {step === "arrived"
                                  ? "Arrival confirmed"
                                  : step[0].toUpperCase() + step.slice(1)}
                              </li>
                            ))}
                          </ol>
                          <div className="button-row">
                            {state.help === "requested" && (
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => act({ type: "acknowledge" })}
                              >
                                Acknowledge demo request
                              </button>
                            )}
                            {state.help === "acknowledged" && (
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() => act({ type: "arrive" })}
                              >
                                Confirm helper arrived
                              </button>
                            )}
                            {state.help === "arrived" && (
                              <button
                                className="secondary"
                                disabled={busy || !supportAvailable(state)}
                                onClick={() => act({ type: "resolve" })}
                              >
                                Confirm concern resolved
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {state.concern && !openHelp(state) && (
                        <div className="notice warning">
                          <AlertTriangle size={18} />
                          <span>
                            Support changed. Reconfirm available people and
                            coverage before resolution.
                          </span>
                          <button
                            disabled={busy || !supportAvailable(state)}
                            onClick={() => act({ type: "resolve" })}
                          >
                            Record human resolution
                          </button>
                        </div>
                      )}
                      <div className="exit-section">
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={state.exit}
                            disabled={busy}
                            onChange={() => confirm("exit")}
                          />
                          <span>
                            <b>Agreed supported exit is complete</b>
                            <small>
                              Human confirmation—not a sensor reading. Ending a
                              routine may still leave concerns open.
                            </small>
                          </span>
                        </label>
                        <button
                          className="primary"
                          disabled={busy || !state.exit}
                          onClick={() => act({ type: "finish" })}
                        >
                          Review handoff <ArrowRight size={17} />
                        </button>
                      </div>
                      <details className="scenario-tools">
                        <summary>Test a change in available support</summary>
                        <p>
                          Fictional scenario: required support becomes
                          unavailable. This must pause the workflow and retain
                          the concern.
                        </p>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => act({ type: "supportLost" })}
                        >
                          Simulate support unavailable
                        </button>
                      </details>
                    </section>
                  )}
                  {stage === 2 && (
                    <section className="card handoff">
                      <div className="card-title">
                        <div className="section-icon">
                          <CheckCheck size={22} />
                        </div>
                        <div>
                          <h2>
                            {state.phase === "declined"
                              ? "A “no” is a complete answer."
                              : state.phase === "complete"
                                ? "The next person gets the whole picture."
                                : "Keep the handoff honest."}
                          </h2>
                          <p>
                            {state.phase === "declined"
                              ? "The routine did not start. Their choice has been recorded."
                              : "Confirmed actions and unresolved concerns, without an AI rewriting the facts."}
                          </p>
                        </div>
                      </div>
                      <div className="handoff-stats">
                        <div>
                          <small>Room checks</small>
                          <strong>{completedChecks} of 6</strong>
                        </div>
                        <div>
                          <small>Supported exit</small>
                          <strong>
                            {state.exit ? "Confirmed" : "Not confirmed"}
                          </strong>
                        </div>
                        <div>
                          <small>Open support items</small>
                          <strong>{warning.length}</strong>
                        </div>
                      </div>
                      <div
                        className={`handoff-concerns ${warning.length ? "has-concerns" : ""}`}
                      >
                        <h3>
                          {warning.length
                            ? "Carry these forward"
                            : "No unresolved support items recorded"}
                        </h3>
                        {warning.length ? (
                          <ul>
                            {warning.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>
                            This is not a safety certification or evidence that
                            a fall was prevented.
                          </p>
                        )}
                      </div>
                      <div className="button-row">
                        <button className="secondary" onClick={download}>
                          <Download size={17} /> Download handoff
                        </button>
                        {state.phase === "handoff" && (
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() => act({ type: "complete" })}
                          >
                            {row
                              ? "Save & close handoff"
                              : "Close local handoff"}{" "}
                            <Check size={16} />
                          </button>
                        )}
                        {ended && (
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() => setNewOpen(true)}
                          >
                            New demo session <Plus size={16} />
                          </button>
                        )}
                      </div>
                      <p className="fine-print">
                        {row
                          ? `Saved in Supabase · revision ${row.revision}.`
                          : "Local walkthrough only. Download to keep a copy; refreshing loses unsaved local work."}{" "}
                        Operator-entered record, not a tamper-proof clinical
                        audit.
                      </p>
                    </section>
                  )}
                  <section className="card timeline">
                    <div className="card-title">
                      <History size={19} />
                      <h2>Session timeline</h2>
                      <span>{state.events.length} events</span>
                    </div>
                    <ol>
                      {state.events
                        .slice(-6)
                        .reverse()
                        .map((event, i) => (
                          <li key={`${event.at}-${i}`}>
                            <span className="timeline-dot" />
                            <time dateTime={event.at}>{time(event.at)}</time>
                            <p>{event.text}</p>
                          </li>
                        ))}
                    </ol>
                    {state.events.length > 6 && (
                      <p className="fine-print">
                        Showing the latest 6 events. The handoff download
                        includes the full timeline.
                      </p>
                    )}
                  </section>
                </div>
                <aside
                  className="context-column"
                  aria-label="Care plan and available support"
                >
                  <section className="care-plan">
                    <div className="mini-label">
                      <BookOpen size={16} /> FICTIONAL CARE PLAN
                    </div>
                    <h2>
                      {state.scenario === "two"
                        ? "Two people required."
                        : "One person required."}
                      <br />
                      <span>Not just on shift.</span>
                    </h2>
                    <p>
                      Requirements are set by an assessed plan. Panoramic does
                      not decide the staffing level.
                    </p>
                    <div className="people">
                      <span className={state.caregiver ? "present" : ""}>
                        <Users size={18} /> Alex
                      </span>
                      {state.scenario === "two" && (
                        <span className={state.helper ? "present" : ""}>
                          <Users size={18} /> Sam
                        </span>
                      )}
                    </div>
                    <div className="plan-foot">
                      <span>
                        {(state.caregiver ? 1 : 0) +
                          (state.scenario === "two" && state.helper
                            ? 1
                            : 0)}{" "}
                        / {state.scenario === "two" ? 2 : 1} confirmed present
                      </span>
                      <span>HUMAN INPUT</span>
                    </div>
                  </section>
                  <section className="card availability">
                    <div className="card-title">
                      <Users size={18} />
                      <h2>Support available now</h2>
                    </div>
                    <label className="shift">
                      Shift context
                      <select
                        value={state.shift}
                        disabled={busy || state.phase !== "prepare"}
                        onChange={(e) =>
                          act({
                            type: "shift",
                            value: e.target.value as "day" | "night",
                          })
                        }
                      >
                        <option value="day">Day shift</option>
                        <option value="night">Awake night shift</option>
                      </select>
                    </label>
                    {supportChecks}
                    <div
                      className={`availability-note ${supportAvailable(state) ? "confirmed" : ""}`}
                    >
                      <span className="status-dot" />
                      {supportAvailable(state)
                        ? "Required support confirmed by operator"
                        : "Required support not yet confirmed"}
                    </div>
                  </section>
                  <section className="cloud-card">
                    <div>
                      <Cloud size={19} />
                      <h3>Session storage</h3>
                    </div>
                    <p>
                      {row
                        ? "This fictional session is saved to Supabase after each successful action. Other guest identities cannot read it."
                        : "Connect to save this fictional session and return to its history in this browser."}
                    </p>
                    {row ? (
                      <button
                        className="text-button"
                        onClick={refresh}
                        disabled={busy}
                      >
                        <RefreshCw size={14} /> Reload saved session
                      </button>
                    ) : (
                      <button
                        className="secondary full"
                        onClick={connect}
                        disabled={busy || !online}
                      >
                        <Cloud size={16} /> Connect & save demo
                      </button>
                    )}
                    <small>
                      Guest access is tied to this browser. Clearing browsing
                      data or signing out loses access. No real patient
                      information.
                    </small>
                  </section>
                </aside>
              </div>
            </>
          )}
          {page === "history" && (
            <>
              <section className="page-heading">
                <div>
                  <p className="eyebrow">SAVED CARE RECORDS</p>
                  <h1>Session history</h1>
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setNewOpen(true)}
                >
                  <Plus size={16} /> New demo session
                </button>
              </section>
              <section className="card history-list">
                {!owner && hasSession ? (
                  <div className="empty-state">
                    <CloudOff size={38} />
                    <h2>No saved sessions yet</h2>
                    <p>Your current session is saved only in this tab.</p>
                    <button
                      className="primary"
                      onClick={connect}
                      disabled={busy}
                    >
                      Connect & save demo <ArrowRight size={16} />
                    </button>
                  </div>
                ) : rows.length === 0 ? (
                  <div className="empty-state">
                    <History size={35} />
                    <h2>No saved sessions yet.</h2>
                    <button
                      className="primary"
                      onClick={() => setNewOpen(true)}
                    >
                      Create a fictional session
                    </button>
                  </div>
                ) : (
                  rows.map((saved) => (
                    <button
                      className="history-row"
                      key={saved.id}
                      onClick={() => {
                        setRow(saved);
                        setState(saved.snapshot);
                        setPage("session");
                        setError("");
                      }}
                    >
                      <span className="resident-avatar small">EM</span>
                      <span>
                        <b>Evelyn M. · fictional</b>
                        <small>
                          {date(saved.updated_at)} ·{" "}
                          {saved.snapshot.scenario === "two"
                            ? "Two-person"
                            : "One-person"}{" "}
                          plan
                        </small>
                      </span>
                      <span className="phase-pill">{saved.snapshot.phase}</span>
                      <span
                        className={
                          missing(saved.snapshot).length ? "open-items" : ""
                        }
                      >
                        {missing(saved.snapshot).length} open items
                      </span>
                      <ArrowUpRight size={18} />
                    </button>
                  ))
                )}
              </section>
            </>
          )}
        </main>
      </div>
      {authOpen && (
        <div
          className="modal-backdrop"
          onClick={() => !busy && setAuthOpen(false)}
        >
          <section
            className="modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close sign in"
              disabled={busy}
              onClick={() => setAuthOpen(false)}
            >
              <X size={20} />
            </button>
            <LockKeyhole size={28} />
            <h2 id="auth-title">Existing account sign-in</h2>
            <p>
              Use a Supabase email/password account already provisioned for this
              prototype. For a quick demo, use guest access instead.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  if (!cloud) throw new Error("Supabase is not configured.");
                  const { data, error } = await cloud.auth.signInWithPassword({
                    email,
                    password,
                  });
                  if (error) throw error;
                  setOwner(data.user.id);
                  setPassword("");
                  setAuthOpen(false);
                  const saved = await listSessions();
                  setRows(saved);
                  if (saved[0]) putRow(saved[0]);
                  else if (hasSession) putRow(await createSession(state, data.user.id));
                });
              }}
            >
              <label>
                Email
                <input
                  autoFocus
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <button className="primary full" disabled={busy}>
                Sign in
              </button>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          </section>
        </div>
      )}
      {newOpen && (
        <div
          className="modal-backdrop"
          onClick={() => !busy && setNewOpen(false)}
        >
          <section
            className="modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close new session"
              disabled={busy}
              onClick={() => setNewOpen(false)}
            >
              <X size={20} />
            </button>
            <Users size={30} />
            <h2 id="new-title">Choose a fictional care plan.</h2>
            <p>
              These are demonstration scenarios, not staffing recommendations.{" "}
              {row
                ? "Your current cloud session stays in history."
                : "Starting again replaces your current unsaved local walkthrough."}
            </p>
            <button
              className="scenario-choice"
              disabled={busy}
              onClick={() => newSession("two")}
            >
              <b>Two-person support</b>
              <span>
                A required helper is not here yet. Make the gap visible.
              </span>
              <ArrowRight size={18} />
            </button>
            <button
              className="scenario-choice"
              disabled={busy}
              onClick={() => newSession("one")}
            >
              <b>One-person support</b>
              <span>
                Still requires preparation, consent, and backup coverage.
              </span>
              <ArrowRight size={18} />
            </button>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
