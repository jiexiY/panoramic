import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHECKS,
  initialState,
  missing,
  ready,
  report,
  transition,
  type State,
} from "../src/workflow.ts";
function prepared(scenario: "one" | "two" = "two"): State {
  let s = initialState(scenario);
  for (const [key] of CHECKS)
    s = transition(s, { type: "check", key, value: true });
  for (const key of [
    "planReviewed",
    "caregiver",
    "helper",
    "coverage",
    "consent",
  ] as const)
    s = transition(s, { type: "confirm", key, value: true });
  return s;
}
test("empty checks cannot start", () =>
  assert.throws(() => transition(initialState(), { type: "start" })));
test("room preparation is not sufficient without available helpers", () => {
  let s = prepared();
  s = transition(s, { type: "confirm", key: "helper", value: false });
  assert.equal(ready(s), false);
  assert.throws(() => transition(s, { type: "start" }));
});
test("one-person plan still requires backup coverage", () => {
  let s = prepared("one");
  s = transition(s, { type: "confirm", key: "helper", value: false });
  assert.equal(ready(s), true);
  s = transition(s, { type: "confirm", key: "coverage", value: false });
  assert.equal(ready(s), false);
});
test("consent is required", () => {
  const s = transition(prepared(), {
    type: "confirm",
    key: "consent",
    value: false,
  });
  assert.throws(() => transition(s, { type: "start" }));
});
test("decline ends without starting and cannot resume", () => {
  const s = transition(initialState(), { type: "decline" });
  assert.equal(s.phase, "declined");
  assert.throws(() => transition(s, { type: "start" }));
  assert.match(report(s), /Declined/);
});
test("shift change clears coverage confirmation", () => {
  const s = transition(prepared(), { type: "shift", value: "night" });
  assert.equal(s.coverage, false);
  assert.equal(ready(s), false);
});
test("help acknowledgment is not arrival or resolution", () => {
  let s = transition(prepared(), { type: "start" });
  s = transition(s, { type: "request" });
  s = transition(s, { type: "acknowledge" });
  assert.equal(s.paused, true);
  assert.throws(() => transition(s, { type: "resume" }));
  assert.throws(() => transition(s, { type: "resolve" }));
  assert.match(report(s), /not resolved/);
});
test("arrival and resolution still require explicit resume", () => {
  let s = transition(prepared(), { type: "start" });
  for (const type of ["request", "acknowledge", "arrive", "resolve"] as const)
    s = transition(s, { type });
  assert.equal(s.paused, true);
  s = transition(s, { type: "resume" });
  assert.equal(s.paused, false);
});
test("support loss pauses and unconfirms physical presence", () => {
  let s = transition(prepared(), { type: "start" });
  s = transition(s, { type: "supportLost" });
  assert.equal(s.helper, false);
  assert.equal(s.coverage, false);
  assert.equal(s.paused, true);
  assert.equal(s.concern, true);
  assert.throws(() => transition(s, { type: "resume" }));
});
test("support restoration does not silently resolve concern", () => {
  let s = transition(prepared(), { type: "start" });
  s = transition(s, { type: "supportLost" });
  s = transition(s, { type: "confirm", key: "helper", value: true });
  s = transition(s, { type: "confirm", key: "coverage", value: true });
  assert.throws(() => transition(s, { type: "resume" }));
  s = transition(s, { type: "resolve" });
  s = transition(s, { type: "resume" });
  assert.equal(s.paused, false);
});
test("unchecking primary presence during support pauses", () => {
  const s = transition(transition(prepared(), { type: "start" }), {
    type: "confirm",
    key: "caregiver",
    value: false,
  });
  assert.equal(s.paused, true);
  assert.equal(s.concern, true);
});
test("cannot finish without supported exit confirmation", () =>
  assert.throws(() =>
    transition(transition(prepared(), { type: "start" }), { type: "finish" }),
  ));
test("handoff retains unresolved issues even when routine closes", () => {
  let s = transition(prepared(), { type: "start" });
  s = transition(s, { type: "supportLost" });
  s = transition(s, { type: "request" });
  s = transition(s, { type: "confirm", key: "exit", value: true });
  s = transition(s, { type: "finish" });
  s = transition(s, { type: "complete" });
  assert.equal(s.phase, "complete");
  assert.ok(missing(s).length >= 3);
  assert.match(report(s), /required second helper/i);
  assert.match(report(s), /Help requested; not resolved/);
});
test("complete session cannot be silently reopened", () => {
  let s = transition(prepared(), { type: "start" });
  s = transition(s, { type: "confirm", key: "exit", value: true });
  s = transition(s, { type: "finish" });
  s = transition(s, { type: "complete" });
  assert.throws(() => transition(s, { type: "start" }));
});
test("preparation cannot be altered after routine begins", () =>
  assert.throws(() =>
    transition(transition(prepared(), { type: "start" }), {
      type: "check",
      key: "floor",
      value: false,
    }),
  ));
test("premature acknowledgments and arrivals rejected", () => {
  const s = transition(prepared(), { type: "start" });
  assert.throws(() => transition(s, { type: "acknowledge" }));
  assert.throws(() => transition(s, { type: "arrive" }));
});
test("duplicate assistance requests are rejected", () => {
  const s = transition(transition(prepared(), { type: "start" }), {
    type: "request",
  });
  assert.throws(() => transition(s, { type: "request" }));
});
test("transition does not mutate its input", () => {
  const s = prepared();
  const before = JSON.stringify(s);
  transition(s, { type: "start" });
  assert.equal(JSON.stringify(s), before);
});
test("report is deterministic from recorded state", () => {
  const s = prepared();
  assert.equal(report(s), report(s));
  assert.match(report(s), /No real patient data/);
});
test("all successful actions append one attributed event", () => {
  const s = prepared();
  const next = transition(s, { type: "start" }, "2026-09-26T04:00:00Z");
  assert.equal(next.events.length, s.events.length + 1);
  assert.equal(next.events.at(-1)?.at, "2026-09-26T04:00:00Z");
});
test("withdrawn consent prevents resuming but permits supported exit", () => {
  let s = transition(prepared(), { type: "start" });
  s = transition(s, { type: "withdraw" });
  assert.equal(s.consent, false);
  assert.throws(() => transition(s, { type: "resume" }));
  s = transition(s, { type: "confirm", key: "exit", value: true });
  s = transition(s, { type: "finish" });
  assert.equal(s.phase, "handoff");
  assert.match(report(s), /Person asked to stop/);
});
