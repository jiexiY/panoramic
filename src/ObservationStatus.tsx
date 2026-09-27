type Props = { on: boolean; pending?: boolean; onToggle?: () => void };

export default function ObservationStatus({ on, pending = false, onToggle }: Props) {
  const stateClass = `observation-state ${pending ? "is-pending" : on ? "is-on" : "is-off"}`;
  const label = pending ? "Starting…" : on ? "On" : "Off";
  return (
    <span className="observation-status" role={onToggle ? undefined : "status"}>
      Observation:
      {onToggle ? (
        <button type="button" role="switch" aria-label="Floor observation" aria-checked={on || pending}
          aria-busy={pending || undefined} className={`observation-toggle ${stateClass}`}
          title="Start or stop the A101 bathroom recording" onClick={onToggle}>
          <i aria-hidden="true" /> {label}
        </button>
      ) : <span className={stateClass}><i aria-hidden="true" /> {label}</span>}
    </span>
  );
}
