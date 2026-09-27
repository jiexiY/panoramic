import { handleElevenLabs } from "../server/elevenlabs.ts";
declare const process: { env: Record<string, string | undefined> };
export default { fetch: (request: Request) => handleElevenLabs(request, process.env) };
