export default function ObservationStatus({ on, playback = false }: { on: boolean; playback?: boolean }) {
  return (
    <span className="observation-status" role="status">
      Observation:
      <span className={`observation-state ${on ? "is-on" : "is-off"}`}>
        <i aria-hidden="true" /> {on ? "On" : "Off"}
      </span>
      {on && playback && <small className="observation-source">Playback</small>}
    </span>
  );
}
