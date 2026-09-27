import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSuiteReportPdf } from "../src/suiteReportPdf.ts";
import { suiteReport } from "../src/suiteReport.ts";
import { suiteIds } from "../src/suiteRecords.ts";
import { playbackStart, playbackWater } from "../src/playback.ts";

test("every suite exports an actual PDF with title and no cross-suite records", () => {
  const state = playbackWater(playbackStart(1800000000000), 1800000000000);
  for (const room of suiteIds) {
    const report = suiteReport(room, state.incidents, state.events, state.members);
    if (room !== "A101") assert.doesNotMatch(report, /A101/);
    const pdf = createSuiteReportPdf(room, report);
    assert.equal(pdf.output("blob").type, "application/pdf");
    assert.match(pdf.output(), /^%PDF-/);
    assert.match(pdf.output(), new RegExp(`Suite ${room} report`));
    assert.ok(pdf.getNumberOfPages() >= 1);
  }
});

test("long reports paginate instead of clipping, and export is a lazy PDF download", () => {
  const report = "PANORAMIC · SUITE A103 REPORT\n" + Array.from({ length: 100 }, (_, i) => `RESPONSE\nRecord ${i}: ${"Review the marked route and record the physical check. ".repeat(10)}\n`).join("\n");
  const pdf = createSuiteReportPdf("A103", report);
  assert.ok(pdf.getNumberOfPages() > 5);
  const ui = readFileSync(new URL("../src/SuiteAI.tsx", import.meta.url), "utf8");
  assert.match(ui, /import\(".\/suiteReportPdf"\)/);
  assert.match(ui, /report\.pdf/); assert.doesNotMatch(ui, /report\.txt/);
  assert.match(ui, /data-view=\{tab\}/); assert.match(ui, /scrollable report/);
  const css = readFileSync(new URL("../src/suite-ai.css", import.meta.url), "utf8");
  assert.match(css, /\[data-view=report\].*max-height:.*overflow-y: auto/);
});
