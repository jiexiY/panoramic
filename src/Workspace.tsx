import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
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
  Users,
  X,
  AlertTriangle,
  UserRound,
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
import FacilityWorkspace from "./FacilityWorkspace";
import MonitoringDashboard from "./MonitoringDashboard";
import { useCareTeam } from "./useCareTeam";
import { usePlaybackTeam } from "./usePlaybackTeam";
import "./playback.css";
import SiteLink, { type Navigate } from "./SiteLink";
import { workspacePaths, type WorkspacePage } from "./routes";
import type { SuiteId } from "./suiteRecords";

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
export default function Workspace({ page, suite, navigate }: { page: WorkspacePage; suite?: SuiteId; navigate: Navigate }) {
  const setPage = (next: WorkspacePage) => navigate(workspacePaths[next]);
  const isCareSession = page === "session" || page === "history";
  const [state, setState] = useState<State>(() => emptyState());
  const hasSession = state.events.length > 0;
  const [row, setRow] = useState<Row | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const sharedCareTeam = useCareTeam(owner);
  const playback = usePlaybackTeam();
  const careTeam = playback.active ? playback.team : sharedCareTeam;
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const working = useRef(false);
  const modalRef = useRef<HTMLElement>(null);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const subscription = cloud?.auth.onAuthStateChange((_event,session) => {
      setOwner(session?.user.id ?? null);
      if (!session) { setRows([]); setRow(null); setState(emptyState()); }
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const heading = [...document.querySelectorAll<HTMLElement>('[data-active-page="true"] .app-shell h1')].find(item => item.getClientRects().length > 0);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [page, suite]);
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
            "You are offline. This action was not saved.",
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
        "Connected. Session saved to your account.",
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
    a.download = `panoramic-handoff-${row?.id.slice(0, 8) ?? "local"}.txt`;
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
          <small>Confirm the current support requirements.</small>
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
          <b>Primary caregiver present</b>
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
            <b>Second helper present</b>
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
            confirmed with the supervisor.
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
            Dashboard
          </button>
          <button aria-current={page === "spatial" ? "page" : undefined} onClick={() => setPage("spatial")}>Resident Floor</button>
          <button
            aria-current={isCareSession ? "page" : undefined}
            onClick={() => setPage("session")}
          >
            Care session
          </button>
        </nav>
        <div className="rail-bottom">
          <SiteLink to="/" navigate={navigate}>Back to start</SiteLink>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <ChevronRight size={14} />
            <b>
              {page === "monitor" ? "Dashboard" : page === "spatial" ? "Resident Floor" : "Care session"}
            </b>
            {(page === "spatial" || page === "monitor") && suite && <><ChevronRight size={14} /><b>Suite {suite}</b></>}
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
                  ? "Saved"
                  : "Not saved to cloud"}
            </span>}
            {!owner && playback.active && <details className="demo-role-menu"><summary className="profile-avatar" aria-label="Demo role settings"><UserRound size={18} strokeWidth={1.7} aria-hidden="true" /></summary><label>Demo role<select aria-label="Demo role" value={playback.actor} onChange={e => playback.setActor(e.target.value)}><option value="supervisor">Supervisor</option><option value="caregiver-01">Caregiver 01</option><option value="nurse-01">Nurse 01</option></select><small>Local demo roles only; this does not grant care-team permissions.</small></label></details>}
            {!owner && !playback.active && (
              <span className="profile-avatar" role="img" aria-label="Placeholder profile" title="Profile placeholder">
                <UserRound size={18} strokeWidth={1.7} aria-hidden="true" />
              </span>
            )}
            {owner && <button className="text-button" onClick={() => void cloud?.auth.signOut()}>Sign out</button>}
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
              Offline. Cloud actions are unavailable.
            </div>
          )}
          <div hidden={page !== "monitor"}>
            <MonitoringDashboard key={owner ?? 'signed-out'} suite={suite} navigate={navigate} onMonitorFrame={playback.monitorFrame} onTracking={playback.tracking} team={careTeam} autoStartRecording={!restoring && !owner} onSignIn={() => setAuthOpen(true)} />
          </div>
          <div hidden={page !== "spatial"}><FacilityWorkspace key={owner ?? 'signed-out'} suite={suite} navigate={navigate} processing={playback.scanning} team={careTeam} onSignIn={() => setAuthOpen(true)} active={page === "spatial"} /></div>
          {isCareSession && <>
            <section className="page-heading">
              <h1>Care session</h1>
              <button className="secondary" onClick={() => setNewOpen(true)} disabled={busy || restoring}>
                <Plus size={17} /> New session
              </button>
            </section>
            <nav className="care-session-tabs" aria-label="Care session views">
              <SiteLink to={workspacePaths.session} navigate={navigate} aria-current={page === "session" ? "page" : undefined}>Current session</SiteLink>
              <SiteLink to={workspacePaths.history} navigate={navigate} aria-current={page === "history" ? "page" : undefined} onClick={() => { if (owner) void refresh(); }}>
                Session history <span className="count">{rows.length}</span>
              </SiteLink>
            </nav>
          </>}
          {page === "session" && !hasSession && <>
            <section className="card session-empty"><HandHeart size={34} /><h2>No care session yet</h2><button className="primary" onClick={() => setNewOpen(true)} disabled={busy || restoring}><Plus size={17} /> New session</button></section>
          </>}
          {page === "session" && hasSession && (
            <>
              <div className="session-grid">
                <div className="flow-column">
                  <section className="resident-strip">
                    <div className="resident-avatar">
                      <HandHeart size={24} />
                      <span />
                    </div>
                    <div>
                      <p className="eyebrow">CURRENT SESSION</p>
                      <h2>Bathing support</h2>
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
                            Confirm whether the resident wants to begin.
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
                            ? "Required confirmations recorded."
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
                              ? "Support paused"
                              : "Care in progress"}
                          </h2>
                          <p>
                            Follow the assessed care plan.
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
                              ? "Review support and open concerns before resuming."
                              : "Record changes as they occur."}
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
                          Notifications off. Contact the caregiver directly.
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
                                Record acknowledgment
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
                            Record resolution
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
                              Open concerns will carry forward to the handoff.
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
                        <summary>Change in available support</summary>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => act({ type: "supportLost" })}
                        >
                          Record support unavailable
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
                              ? "Session declined"
                              : state.phase === "complete"
                                ? "Handoff complete"
                                : "Review handoff"}
                          </h2>
                          <p>
                            {state.phase === "declined"
                              ? "The routine did not start. Their choice has been recorded."
                              : "Actions and unresolved concerns."}
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
                        ) : null}
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
                            New session <Plus size={16} />
                          </button>
                        )}
                      </div>
                      <p className="fine-print">
                        {row
                          ? `Saved · revision ${row.revision}.`
                          : "Not saved to cloud. Download before closing this tab."}
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
                      <BookOpen size={16} /> SUPPORT PLAN
                    </div>
                    <h2>
                      {state.scenario === "two"
                        ? "Two-person support"
                        : "One-person support"}
                    </h2>
                    <div className="people">
                      <span className={state.caregiver ? "present" : ""}>
                        <Users size={18} /> Primary caregiver
                      </span>
                      {state.scenario === "two" && (
                        <span className={state.helper ? "present" : ""}>
                          <Users size={18} /> Second helper
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
                        ? "Changes are saved after each action."
                        : "Connect to save this session."}
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
                        <Cloud size={16} /> Connect & save
                      </button>
                    )}
                    <small>
                      Guest access is tied to this browser. Clearing browsing
                      data or signing out loses access.
                    </small>
                  </section>
                </aside>
              </div>
            </>
          )}
          {page === "history" && (
            <>
              <section className="card history-list" aria-label="Session history">
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
                      Connect & save <ArrowRight size={16} />
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
                      Create a session
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
                      <span className="resident-avatar small"><HandHeart size={20} /></span>
                      <span>
                        <b>Care session</b>
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
            <h2 id="auth-title">{creatingAccount ? 'Create care-team account' : 'Sign in'}</h2>
            <p>Use your workspace account.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  if (!cloud) throw new Error("Supabase is not configured.");
                  if (creatingAccount) {
                    const result = await cloud.auth.signUp({ email, password });
                    if (result.error) throw result.error;
                    setPassword(''); setAuthOpen(false);
                    setNotice('Check your email to confirm your account, then sign in. Your coordinator can then add you to the care team.');
                    return;
                  }
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
                  autoComplete={creatingAccount ? "new-password" : "current-password"}
                  minLength={creatingAccount ? 12 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <button className="primary full" disabled={busy}>
                {creatingAccount ? 'Create account' : 'Sign in'}
              </button>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </form>
            <div className="auth-mode"><button className="text-button" disabled={busy} onClick={() => { setCreatingAccount(!creatingAccount); setError(''); }}>{creatingAccount ? 'Already have an account? Sign in' : 'Create a care-team account'}</button></div>
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
            <h2 id="new-title">New care session</h2>
            <p>
              Select the support arrangement in the assessed care plan.{" "}
              {row
                ? "Your current cloud session stays in history."
                : hasSession ? "Starting again replaces your unsaved session." : ""}
            </p>
            <button
              className="scenario-choice"
              disabled={busy}
              onClick={() => newSession("two")}
            >
              <b>Two-person support</b>
              <span>
                Primary caregiver and a second helper.
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
                Primary caregiver with backup coverage.
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
