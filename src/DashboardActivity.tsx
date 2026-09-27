import { useEffect, useRef, useState } from "react";
import type { SuiteId } from "./suiteRecords";
import type { CareTeam } from "./useCareTeam";
import SceneMonitor from "./SceneMonitor";
import { activityTime, analysisActivity, appendActivity, dashboardActivity, type ActivityEntry } from "./activityTimeline";
import { useActivitySequence } from "./useActivitySequence";

function ActivityClock() {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span className="activity-clock">Local time <time dateTime={now}>{activityTime(now)}</time></span>;
}

export default function DashboardActivity({ room, team, monitorEntries, onSignIn }: {
  room: SuiteId; team: CareTeam; monitorEntries: ActivityEntry[]; onSignIn: () => void;
}) {
  const [analyses, setAnalyses] = useState<ActivityEntry[]>([]);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const rows = dashboardActivity(room, team.incidents, team.events, [...monitorEntries, ...analyses]);
  const visibleRows = useActivitySequence(`${team.facilityId}:${room}`, rows);
  const feed = useRef<HTMLDivElement>(null), followNewest = useRef(true);
  const visibleKey = visibleRows.map(row => `${row.id}:${row.at}`).join("|");
  useEffect(() => { followNewest.current = true; }, [room]);
  useEffect(() => {
    if (feed.current && followNewest.current) feed.current.scrollTop = feed.current.scrollHeight;
  }, [room, visibleKey]);
  return <section className="dashboard-activity" aria-label={`Suite ${room} activity`}>
    <header className="dashboard-activity-heading">
      <div><h2>Activity</h2><p>Suite {room} · Monitoring, analysis & response</p></div>
      <ActivityClock />
    </header>
    <div className="activity-feed" ref={feed} onScroll={event => {
      const node = event.currentTarget;
      followNewest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
    }} role="log" aria-label={`Suite ${room} timestamped updates`} aria-live="polite" aria-relevant="additions text">
      {rows.length ? <ol>{visibleRows.map(row => <li key={row.id}>
        <time dateTime={row.at} title={new Date(row.at).toLocaleString()}>[{activityTime(row.at)}]</time>
        <p><strong>{row.zone}</strong> · {row.text}</p>
      </li>)}</ol> : <p className="activity-empty">No results recorded for Suite {room} yet. New monitoring and response updates will appear here.</p>}
    </div>
    {/* Keep an in-progress analysis accessible if monitoring results arrive. */}
    {(rows.length === 0 || analysisOpen) && <div className="activity-living-area">
      <div><h3>Living area</h3><p>No living-area frame analyzed for this suite.</p></div>
      <button className="secondary" aria-expanded={analysisOpen} aria-controls="living-area-analysis" onClick={() => setAnalysisOpen(open => !open)}>{analysisOpen ? "Close analysis" : "Analyze living area"}</button>
    </div>}
    {analysisOpen && <div id="living-area-analysis" className="activity-analysis">
      <p className="activity-analysis-note">Analyze an unoccupied-room image or a paused video frame. Results join this suite’s Activity; this is not continuous camera analysis.</p>
      <SceneMonitor key={`${room}:${team.mode}`} embedded activityMode scopeRoom={room} team={team} onSignIn={onSignIn}
        onAnalysis={(id, zone, analysis) => {
          setAnalyses(current => appendActivity(current, analysisActivity(id, room, zone, analysis)));
          setAnalysisOpen(false);
        }} />
    </div>}
  </section>;
}
