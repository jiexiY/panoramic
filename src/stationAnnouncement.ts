import { isSuiteId, type SuiteId } from "./suiteRecords.ts";
import type { RoutePriority } from "./routeRisk.ts";

export type AnnouncementPriority = Exclude<RoutePriority, "object">;
export function isAnnouncementPriority(value: unknown): value is AnnouncementPriority {
  return typeof value === "string" && ["unassessed", "away", "near", "crossing"].includes(value);
}

// Fixed templates only. Never send resident names, images, free text, or care notes to TTS.
export function stationAnnouncement(room: SuiteId, priority: AnnouncementPriority): string {
  if (!isSuiteId(room) || !isAnnouncementPriority(priority)) throw new Error("Invalid station announcement.");
  const level = { unassessed: "Route level has not been assessed.", away: "Level one, outside the marked route.", near: "Level two, near the marked route.", crossing: "Level three, crossing the marked route." }[priority];
  return `Panoramic to supervision station. Possible environmental hazard in suite ${room}. ${level} Please review the suite report and approve a proposed caregiver or nurse assignment. No responder has been assigned automatically.`;
}
