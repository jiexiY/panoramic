import { isSuiteId, type SuiteId } from "./suiteRecords.ts";

export type MonitorZone = "bedroom" | "bathroom";
export type MonitoringImage = Readonly<{
  src: string;
  origin: "imported" | "generated";
  width: number;
  height: number;
  alt: string;
  details: string;
}>;

// Static sources are suite- and zone-specific. Loading one is not a detection event.
const images: Partial<Record<SuiteId, Partial<Record<MonitorZone, MonitoringImage>>>> = {
  A101: {
    bedroom: {
      src: "/demo/a101-bedroom-google.jpg",
      origin: "generated",
      width: 1376,
      height: 768,
      alt: "Suite A101 synthetic bedroom with blue bedding and a wheeled overbed table near the bathroom approach",
      details: "Synthetic demonstration still showing a wheeled overbed table beside the bed-to-bathroom route. OpenCV tracks manually marked regions in a separate synthetic preview, not a live camera feed. Hazard labels are human-authored; the image has not undergone automated hazard assessment. The bedroom report stays separate from the A101 bathroom water concern.",
    },
  },
  A102: {
    bedroom: {
      src: "/demo/a102-bedroom.jpg",
      origin: "imported",
      width: 1376,
      height: 768,
      alt: "Suite A102 bedroom reference with a wheeled laundry hamper beside the route from the bed to the bathroom",
      details: "User-supplied synthetic bedroom image. A still image cannot confirm whether the hamper is moving or its wheels are locked. This import has not undergone automated hazard assessment and is not a live camera feed.",
    },
    bathroom: {
      src: "/demo/a102-bathroom.jpg",
      origin: "imported",
      width: 1055,
      height: 596,
      alt: "Suite A102 bathroom reference with a toilet, level-access shower, sink, and grab rails",
      details: "User-supplied bathroom reference image. This import has not undergone automated hazard assessment and is not a live camera feed. It does not verify that the room is safe or clear an existing concern.",
    },
  },
  A103: {
    bedroom: {
      src: "/demo/a103-bedroom-google.jpg",
      origin: "generated",
      width: 1376,
      height: 768,
      alt: "Suite A103 synthetic sage-green bedroom with a curled rug corner near the foot of the bed",
      details: "Synthetic demonstration still with a curled rug corner near the walking approach. This image has not undergone automated hazard assessment and is not a live camera feed. The staged scene is not a detection result.",
    },
    bathroom: {
      src: "/demo/a103-bathroom-google.jpg",
      origin: "generated",
      width: 1376,
      height: 768,
      alt: "Suite A103 synthetic terracotta-tiled bathroom with a blue towel on the floor beside the shower",
      details: "Synthetic demonstration still with a towel on the bathroom floor. This image has not undergone automated hazard assessment and is not a live camera feed. The staged scene is not a detection result.",
    },
  },
  A104: {
    bedroom: {
      src: "/demo/a104-bedroom-google.jpg",
      origin: "generated",
      width: 1376,
      height: 768,
      alt: "Suite A104 synthetic blue-gray bedroom with rust-colored bedding and an uncluttered bathroom approach",
      details: "Synthetic demonstration still with an uncluttered walking approach. This image has not undergone automated hazard assessment and is not a live camera feed. An uncluttered-looking still does not establish safety or clear any concern.",
    },
    bathroom: {
      src: "/demo/a104-bathroom-google.jpg",
      origin: "generated",
      width: 1376,
      height: 768,
      alt: "Suite A104 synthetic ivory-tiled bathroom with a sage mosaic band, support rails, and an uncluttered floor",
      details: "Synthetic demonstration still with an uncluttered bathroom floor. This image has not undergone automated hazard assessment and is not a live camera feed. It does not verify cleanup or clear any concern.",
    },
  },
};

export function monitoringImage(room: string, zone: MonitorZone): MonitoringImage | undefined {
  return isSuiteId(room) ? images[room]?.[zone] : undefined;
}

export function hasMonitoringImages(room: string): boolean {
  return !!(monitoringImage(room, "bedroom") || monitoringImage(room, "bathroom"));
}
