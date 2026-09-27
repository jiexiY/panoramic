import { isSuiteId } from "../src/suiteRecords.ts";
import { isAnnouncementPriority } from "../src/stationAnnouncement.ts";

// Development only: retain the write-only ElevenLabs key in the production server.
// No configurable destination, cookies, API keys, or arbitrary text are forwarded.
const endpoint = "https://panoramic-app.vercel.app/api/elevenlabs";
const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: responseHeaders });

export function createLocalStationVoice(fetchRemote: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    const local = new URL(request.url);
    if (local.hostname !== "127.0.0.1" && local.hostname !== "localhost") return json({ error: "Local voice connection only." }, 403);
    if (request.method !== "GET" && request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const origin = request.headers.get("origin");
    if (origin && origin !== local.origin) return json({ error: "Cross-origin requests are not allowed." }, 403);
    try {
      const headers = new Headers();
      let body: string | undefined;
      if (request.method === "POST") {
        const code = request.headers.get("x-voice-access-code") ?? "";
        if (code.length < 16 || code.length > 256) return json({ error: "Enter the private station voice access code." }, 401);
        if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON." }, 415);
        const reader = request.body?.getReader();
        if (!reader) return json({ error: "Missing request." }, 400);
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 1024) { await reader.cancel(); return json({ error: "Announcement request is too large." }, 413); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        let data;
        try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: "Invalid JSON." }, 400); }
        if (!data || Array.isArray(data) || data.nonSensitiveConfirmed !== true || !isSuiteId(data.room) || !isAnnouncementPriority(data.priority)
          || Object.keys(data).some(key => !["room", "priority", "nonSensitiveConfirmed"].includes(key))) {
          return json({ error: "Only approved, non-sensitive suite announcements are supported." }, 400);
        }
        body = JSON.stringify({ room: data.room, priority: data.priority, nonSensitiveConfirmed: true });
        headers.set("content-type", "application/json");
        headers.set("x-voice-access-code", code);
        headers.set("origin", new URL(endpoint).origin);
      }
      const remote = await fetchRemote(endpoint, {
        method: request.method, headers, body, redirect: "error",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
      });
      if (request.method === "GET") {
        if (!remote.ok) throw new Error("Voice server unavailable");
        const status = await remote.json();
        return json({ configured: status.configured === true, provider: "ElevenLabs", connection: "production-relay",
          message: status.configured === true
            ? "Connected through Panoramic's production voice server. Use the same private voice access code."
            : "The production voice server is not configured." });
      }
      if (!remote.ok) {
        const errors: Record<number, string> = {
          401: "Enter the private station voice access code.",
          429: "Voice request or credit limit reached. No automatic retry was made.",
          503: "The production voice server is not configured.",
          504: "Voice request timed out. No automatic retry was made.",
        };
        return json({ error: errors[remote.status] ?? "The voice server could not generate the announcement. Use the written message." }, errors[remote.status] ? remote.status : 502);
      }
      if (!remote.headers.get("content-type")?.startsWith("audio/")) throw new Error("Invalid audio");
      const audio = await remote.arrayBuffer();
      if (!audio.byteLength || audio.byteLength > 5_000_000) throw new Error("Invalid audio size");
      return new Response(audio, { headers: { ...responseHeaders, "Content-Type": "audio/mpeg" } });
    } catch {
      return json({ error: "Production voice connection unavailable. No automatic retry was made." }, 502);
    }
  };
}
