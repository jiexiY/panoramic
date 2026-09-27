import { parseAnnouncementRequest, stationAnnouncement } from "../src/stationAnnouncement.ts";

type Env = Record<string, string | undefined>;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export function createElevenLabsHandler(deps: { fetch?: typeof fetch; now?: () => number } = {}) {
  const requestFetch = deps.fetch ?? fetch, now = deps.now ?? Date.now;
  // Per-process guard only, not a distributed spending cap. Configure a provider quota too.
  let started = 0, calls = 0, busy = false;
  return async (request: Request, env: Env): Promise<Response> => {
    const configured = !!env.ELEVENLABS_API_KEY && /^[a-zA-Z0-9_-]{1,80}$/.test(env.ELEVENLABS_VOICE_ID ?? "")
      && (env.ELEVENLABS_ACCESS_CODE?.length ?? 0) >= 16 && env.ELEVENLABS_USAGE_CONFIRMED === "true";
    if (request.method === "GET") return json({ configured, updatesSupported: true, provider: "ElevenLabs", message: configured ? "Server configured; voice is verified only after successful playback." : "Station voice is not connected. Configure the server API key, voice ID, private voice access code, and usage approval." });
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    if (!configured) return json({ error: "ElevenLabs is not configured. No announcement was sent." }, 503);
    if (request.headers.get("x-voice-access-code") !== env.ELEVENLABS_ACCESS_CODE) return json({ error: "Enter the private station voice access code." }, 401);
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Cross-origin requests are not allowed." }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON." }, 415);
    let ownsRequest = false;
    try {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: "Missing request." }, 400);
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 1024) { await reader.cancel(); return json({ error: "Announcement request is too large." }, 413); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: "Invalid JSON." }, 400); }
      const announcement = parseAnnouncementRequest(body);
      if (!announcement) return json({ error: "Confirm this fixed suite announcement contains no sensitive resident information. Free-text speech is not supported." }, 400);
      if (now() - started >= 60_000) { started = now(); calls = 0; }
      if (busy || calls >= 4) return json({ error: "Voice request limit reached. No automatic retry was made." }, 429);
      busy = true; ownsRequest = true; calls++;
      const upstream = await requestFetch(`https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`, {
        method: "POST", signal: AbortSignal.timeout(25_000),
        headers: { "Content-Type": "application/json", "xi-api-key": env.ELEVENLABS_API_KEY! },
        body: JSON.stringify({ text: stationAnnouncement(announcement.room, announcement.priority, announcement.update, announcement.zone), model_id: "eleven_multilingual_v2" }),
      });
      if (upstream.status === 429) return json({ error: "ElevenLabs quota reached. No retry or paid upgrade was attempted." }, 429);
      if (!upstream.ok || !upstream.headers.get("content-type")?.startsWith("audio/")) return json({ error: "ElevenLabs could not generate the announcement. Use the written station message." }, 502);
      const audio = await upstream.arrayBuffer();
      if (!audio.byteLength || audio.byteLength > 5_000_000) return json({ error: "Invalid audio response. Use the written station message." }, 502);
      return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    } catch { return json({ error: "Voice request failed or timed out. Use the written station message. No automatic retry was made." }, 504); }
    finally { if (ownsRequest) busy = false; }
  };
}
export const handleElevenLabs = createElevenLabsHandler();
