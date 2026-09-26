export const CHECKS = [
  [
    "route",
    "Walking route clear",
    "Check the whole route, including the supported exit.",
  ],
  [
    "floor",
    "Floor checked in person",
    "Confirm conditions directly; a photo cannot establish grip.",
  ],
  [
    "equipment",
    "Care-plan equipment available",
    "Use the equipment and trained support specified in the assessed plan.",
  ],
  [
    "supports",
    "Supports checked",
    "Follow the established inspection process; appearance is not proof of strength.",
  ],
  [
    "water",
    "Water checked",
    "Confirm in person using the care plan and facility procedure.",
  ],
  [
    "privacy",
    "Comfort and privacy discussed",
    "Explain the routine, listen, and keep their choices central.",
  ],
] as const;
export type Check = (typeof CHECKS)[number][0];
export type Phase = "prepare" | "support" | "handoff" | "complete" | "declined";
export type Help =
  "none" | "requested" | "acknowledged" | "arrived" | "resolved";
export type State = {
  schema: 1;
  scenario: "one" | "two";
  phase: Phase;
  consent: boolean;
  checks: Record<Check, boolean>;
  planReviewed: boolean;
  caregiver: boolean;
  helper: boolean;
  coverage: boolean;
  shift: "day" | "night";
  help: Help;
  paused: boolean;
  exit: boolean;
  concern: boolean;
  events: { at: string; text: string }[];
};
export type Action =
  | { type: "check"; key: Check; value: boolean }
  | {
      type: "confirm";
      key:
        | "planReviewed"
        | "caregiver"
        | "helper"
        | "coverage"
        | "consent"
        | "exit";
      value: boolean;
    }
  | { type: "shift"; value: "day" | "night" }
  | {
      type:
        | "start"
        | "decline"
        | "withdraw"
        | "pause"
        | "resume"
        | "request"
        | "acknowledge"
        | "arrive"
        | "resolve"
        | "supportLost"
        | "finish"
        | "complete";
    };
export function emptyState(scenario: "one" | "two" = "two"): State {
  return {
    schema: 1,
    scenario,
    phase: "prepare",
    consent: false,
    checks: {
      route: false,
      floor: false,
      equipment: false,
      supports: false,
      water: false,
      privacy: false,
    },
    planReviewed: false,
    caregiver: false,
    helper: false,
    coverage: false,
    shift: "day",
    help: "none",
    paused: false,
    exit: false,
    concern: false,
    events: [],
  };
}
export function initialState(scenario: "one" | "two" = "two"): State {
  return {
    ...emptyState(scenario),
    events: [
      {
        at: new Date().toISOString(),
        text: "Care session created.",
      },
    ],
  };
}
export const supportAvailable = (s: State) =>
  s.planReviewed &&
  s.caregiver &&
  s.coverage &&
  (s.scenario === "one" || s.helper);
export const ready = (s: State) =>
  Object.values(s.checks).every(Boolean) && supportAvailable(s) && s.consent;
export const openHelp = (s: State) => !["none", "resolved"].includes(s.help);
export function missing(s: State): string[] {
  const items: string[] = [];
  if (!s.planReviewed) items.push("Care plan not reviewed");
  if (!s.caregiver) items.push("Primary caregiver presence not confirmed");
  if (s.scenario === "two" && !s.helper)
    items.push("Required second helper not confirmed present");
  if (!s.coverage)
    items.push("Backup and other-resident coverage not confirmed");
  if (s.concern) items.push("Support change still needs human resolution");
  if (openHelp(s)) items.push(`Help ${s.help}; not resolved`);
  return items;
}
function requireThat(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function transition(
  current: State,
  action: Action,
  at = new Date().toISOString(),
): State {
  requireThat(
    !["complete", "declined"].includes(current.phase),
    "This session is closed. Start a new session.",
  );
  const s = structuredClone(current);
  let text = "";
  if (action.type === "check") {
    requireThat(
      s.phase === "prepare",
      "Preparation checks can only change before the routine.",
    );
    s.checks[action.key] = action.value;
    text = `${CHECKS.find((c) => c[0] === action.key)?.[1]}: ${action.value ? "confirmed" : "unconfirmed"}.`;
  } else if (action.type === "confirm") {
    const allowed =
      action.key === "exit"
        ? ["support", "handoff"].includes(s.phase)
        : action.key === "consent"
          ? s.phase === "prepare"
          : ["prepare", "support"].includes(s.phase);
    requireThat(allowed, "This confirmation is not available at this step.");
    s[action.key] = action.value;
    const names = {
      planReviewed: "Assessed care plan reviewed",
      caregiver: "Primary caregiver present",
      helper: "Required helper physically present",
      coverage: "Backup and other-resident coverage confirmed",
      consent: "Person agrees to begin",
      exit: "Agreed supported exit completed",
    };
    text = `${names[action.key]}: ${action.value ? "confirmed by operator" : "not confirmed"}.`;
    if (s.phase === "support" && !supportAvailable(s)) {
      s.paused = true;
      s.concern = true;
      text += " Workflow paused: required support unavailable.";
    }
  } else if (action.type === "shift") {
    requireThat(
      s.phase === "prepare",
      "Shift context is set during preparation.",
    );
    s.shift = action.value;
    s.coverage = false;
    text = `Shift context: ${s.shift}. Coverage must be reconfirmed.`;
  } else if (action.type === "start") {
    requireThat(
      s.phase === "prepare" && ready(s),
      "Confirm preparation, consent, and required support first.",
    );
    s.phase = "support";
    text =
      "Operator began the planned routine.";
  } else if (action.type === "decline") {
    requireThat(
      s.phase === "prepare",
      "Use pause or end the routine once care has begun.",
    );
    s.phase = "declined";
    s.consent = false;
    text = "Person declined. Routine not started; choice respected.";
  } else if (action.type === "withdraw") {
    requireThat(
      s.phase === "support",
      "Withdrawal is recorded during support.",
    );
    s.consent = false;
    s.paused = true;
    text =
      "Person asked to stop. Routine cannot resume; arrange the supported exit under the care plan.";
  } else if (action.type === "pause") {
    requireThat(s.phase === "support", "Pause is available during support.");
    s.paused = true;
    text = "Routine paused by operator.";
  } else if (action.type === "resume") {
    requireThat(
      s.phase === "support" &&
        s.paused &&
        s.consent &&
        supportAvailable(s) &&
        !openHelp(s) &&
        !s.concern,
      "Consent, required support, and unresolved help must be reviewed before resuming.",
    );
    s.paused = false;
    text = "Operator confirmed reassessment and resumed the workflow.";
  } else if (action.type === "request") {
    requireThat(
      s.phase === "support" && !openHelp(s),
      "An assistance request is already open or the routine has not begun.",
    );
    s.help = "requested";
    s.paused = true;
    text =
      "Help request recorded. Notifications off.";
  } else if (action.type === "acknowledge") {
    requireThat(s.help === "requested", "A request must come first.");
    s.help = "acknowledged";
    text =
      "Request acknowledged. Arrival and resolution pending.";
  } else if (action.type === "arrive") {
    requireThat(
      s.help === "acknowledged",
      "Acknowledge the request before recording arrival.",
    );
    s.help = "arrived";
    text = "Operator confirmed helper arrival. Concern not yet resolved.";
  } else if (action.type === "resolve") {
    requireThat(
      s.phase === "support" &&
        (!openHelp(s) || s.help === "arrived") &&
        supportAvailable(s),
      "Confirm helper arrival and required support before recording resolution.",
    );
    s.help = s.help === "none" ? "none" : "resolved";
    s.concern = false;
    text =
      "Operator confirmed concern resolved. Workflow remains paused until explicit resume.";
  } else if (action.type === "supportLost") {
    requireThat(
      s.phase === "support",
      "Support changes can be recorded during the routine.",
    );
    s.coverage = false;
    s.paused = true;
    s.concern = true;
    if (s.scenario === "two") s.helper = false;
    text =
      "Required support changed. Reassessment needed.";
  } else if (action.type === "finish") {
    requireThat(
      s.phase === "support" && s.exit,
      "A human must confirm the agreed supported exit before handoff.",
    );
    s.phase = "handoff";
    text =
      "Supported exit confirmed; handoff opened. Unresolved concerns are retained.";
  } else if (action.type === "complete") {
    requireThat(
      s.phase === "handoff" && s.exit,
      "Review the handoff after the supported exit.",
    );
    s.phase = "complete";
    text =
      "Handoff closed. Unresolved concerns retained.";
  }
  requireThat(
    s.events.length < 500,
    "This session has reached its event limit.",
  );
  s.events.push({ at, text });
  return s;
}
export function report(s: State): string {
  return [
    "PANORAMIC · CARE HANDOFF",
    `Status: ${s.phase}`,
    `Support arrangement: ${s.scenario === "two" ? "Two-person assistance" : "One-person assistance"}`,
    `Shift: ${s.shift}`,
    `Choice: ${s.phase === "declined" ? "Declined" : s.consent ? "Agreed to begin" : "Not confirmed"}`,
    `Supported exit: ${s.exit ? "Human-confirmed" : "Not confirmed"}`,
    "",
    "Unresolved support / help:",
    ...(missing(s).length
      ? missing(s)
      : ["None recorded."]),
    "",
    "Preparation:",
    ...CHECKS.map(
      ([key, label]) =>
        `${label}: ${s.checks[key] ? "confirmed" : "not confirmed"}`,
    ),
    "",
    "Operator-entered timeline:",
    ...s.events.map((e) => `${e.at} — ${e.text}`),
    "",
    "Notifications: not connected.",
  ].join("\n");
}
