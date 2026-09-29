import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("ordinary builds never run the live Gemini verification", () => {
  for (const mode of ["", "false", "https://untrusted.test"]) {
    const child = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/verify-gemini.mjs"], {
      encoding: "utf8", env: { ...process.env, PANORAMIC_VERIFY_GEMINI: mode },
    });
    assert.equal(child.status, 0);
    assert.equal(child.stdout.trim(), "");
  }
});

test("a requested live check fails closed without private settings or free-tier confirmation", () => {
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/verify-gemini.mjs"], {
    encoding: "utf8", env: { ...process.env, PANORAMIC_VERIFY_GEMINI: "candidate", GEMINI_API_KEY: "", GEMINI_DEMO_ACCESS_CODE: "", GEMINI_FREE_TIER_CONFIRMED: "false" },
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Deployment stopped/);
});

test("verification ships without other development scripts and cannot send secrets to a custom target", () => {
  const script = readFileSync("scripts/verify-gemini.mjs", "utf8");
  assert.match(script, /https:\/\/panoramic-app\.vercel\.app\/api\/gemini/);
  assert.doesNotMatch(script, /console\.(log|error)\(process\.env/);
  assert.match(readFileSync(".vercelignore", "utf8"), /scripts\/\*\r?\n!scripts\/verify-gemini\.mjs/);
});
