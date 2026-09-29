export class GeminiRequestError extends Error {
  status: number;
  constructor(message: string, status = 0) { super(message); this.status = status; }
}

// Bound the whole exchange, including body decoding. Never retry generation or
// include raw HTML/provider responses (which may contain infrastructure details).
export async function requestGemini<T>(request: typeof fetch, init: RequestInit = {}, timeoutMs = 45_000): Promise<T> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline.signal]) : deadline.signal;
  try {
    const response = await request("/api/gemini", { ...init, signal });
    let result;
    try { result = await response.json(); }
    catch (error) {
      if (signal.aborted) throw error;
      throw new GeminiRequestError("The AI server returned an unreadable response. Try again; no action was taken.", response.status);
    }
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new GeminiRequestError("The AI server returned an invalid response. Try again; no action was taken.", response.status);
    if (!response.ok) throw new GeminiRequestError(typeof result.error === "string" ? result.error : "The AI request failed. Try again; no action was taken.", response.status);
    return result as T;
  } catch (error) {
    // Caller cancellation belongs to the component lifecycle, not a visible error.
    if (init.signal?.aborted) throw error;
    if (deadline.signal.aborted) throw new GeminiRequestError("Gemini took too long to respond. You can send the question again. No automatic retry or action was made.", 504);
    if (error instanceof GeminiRequestError) throw error;
    throw new GeminiRequestError("Could not reach the AI server. Check your connection and try again. No action was taken.");
  } finally { clearTimeout(timer); }
}
