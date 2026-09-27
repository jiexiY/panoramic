// Convert the browser's credential-free demo export into reusable MP3s and transcripts.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stationAnnouncement } from "../src/stationAnnouncement.ts";
const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/extract-sarah-library.mjs <downloaded-library.json>");
const library = JSON.parse(await readFile(input, "utf8"));
if (library.version !== 1 || library.voice !== "Sarah" || !Array.isArray(library.clips) || library.clips.length > 64) throw new Error("Invalid Sarah demo library.");
const output = resolve("output/sarah-library", new Date().toISOString().replace(/[:.]/g, "-"));
const validated = library.clips.map((clip, n) => {
  const a = clip.announcement;
  if (clip.text !== stationAnnouncement(a.room, a.priority, a.update, a.zone) || clip.mimeType !== "audio/mpeg" || typeof clip.audioBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(clip.audioBase64)) throw new Error("Unapproved text or audio in export.");
  const bytes = Buffer.from(clip.audioBase64, "base64");
  if (!bytes.length || bytes.length > 5_000_000) throw new Error("Invalid audio size.");
  return { filename: `${String(n + 1).padStart(2, "0")}-${a.room}-${a.zone?.replace(/ /g, "-") || "suite"}-${a.update || "alert"}.mp3`, bytes, text: clip.text };
});
await mkdir(output, { recursive: true });
for (const clip of validated) await writeFile(resolve(output, clip.filename), clip.bytes, { flag: "wx" });
await writeFile(resolve(output, "transcripts.txt"), validated.map(c => `${c.filename}\n${c.text}\n`).join("\n"), { flag: "wx" });
console.log(JSON.stringify({ clips: validated.length, output }));
