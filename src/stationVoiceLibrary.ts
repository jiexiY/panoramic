import { eventVoiceMessage, incidentVoiceMessage, stationAnnouncement, type VoiceMessage, type StationAnnouncement } from "./stationAnnouncement.ts";
import { suiteIds } from "./suiteRecords.ts";
import type { SharedIncident, IncidentEvent } from "./incidents.ts";

export type SavedVoiceClip = { text: string; audio: Blob; announcement: StationAnnouncement; createdAt: string };
const databaseName = "panoramic-sarah-demo-audio-v1";
export function demoVoiceMessages(incidents: SharedIncident[], events: IncidentEvent[]): VoiceMessage[] {
  const messages: VoiceMessage[] = [];
  for (const room of suiteIds) {
    const records = incidents.filter(i => i.room === room);
    if (!records.length) messages.push({ key: `monitoring:${room}`, announcement: { room, priority: "unassessed", update: "monitoring" } });
    for (const record of records) { const m = incidentVoiceMessage(room, record); if (m) messages.push(m); }
    for (const event of events) { const m = eventVoiceMessage(room, event, records); if (m) messages.push(m); }
  }
  return [...new Map(messages.map(m => [stationAnnouncement(m.announcement.room, m.announcement.priority, m.announcement.update, m.announcement.zone), m])).values()];
}
export function validSavedClip(clip: SavedVoiceClip): boolean {
  try {
    const a = clip.announcement;
    return clip.text === stationAnnouncement(a.room, a.priority, a.update, a.zone)
      && clip.audio instanceof Blob && clip.audio.type.startsWith("audio/") && clip.audio.size > 0 && clip.audio.size <= 5_000_000;
  } catch { return false; }
}
function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("clips", { keyPath: "text" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("This browser could not open saved audio storage."));
  });
}
export async function loadVoiceLibrary(): Promise<SavedVoiceClip[]> {
  const db = await openLibrary();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction("clips", "readonly").objectStore("clips").getAll();
    request.onsuccess = () => resolve(request.result.filter(validSavedClip).slice(-64));
    request.onerror = () => reject(new Error("Saved audio could not be read."));
  }); } finally { db.close(); }
}
export async function saveVoiceClip(clip: SavedVoiceClip) {
  if (!validSavedClip(clip)) throw new Error("Only fixed demo announcement audio can be saved.");
  const db = await openLibrary();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("clips", "readwrite"), store = tx.objectStore("clips");
    store.put(clip);
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result.sort((a: SavedVoiceClip, b: SavedVoiceClip) => a.createdAt.localeCompare(b.createdAt));
      entries.slice(0, Math.max(0, entries.length - 64)).forEach((entry: SavedVoiceClip) => store.delete(entry.text));
    };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error("Audio could not be saved. Browser storage may be full."));
    tx.onabort = () => reject(new Error("Audio storage was interrupted."));
  }); } finally { db.close(); }
}
