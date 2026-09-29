import { requestGemini } from "./geminiRequest.ts";

export type AssistantAccessState = {
  code: string; consent: boolean; ready: boolean; verified: boolean; checking: boolean;
  verifying: boolean; model: string; status: string; error: string;
};

// Owned by one mounted workspace, not a module singleton or browser storage.
export function createAssistantAccess(request: typeof fetch) {
  let state: AssistantAccessState = { code: "", consent: false, ready: false, verified: false,
    checking: true, verifying: false, model: "Gemini", status: "Checking connection…", error: "" };
  const listeners = new Set<() => void>();
  let connection: AbortController | null = null, verification: AbortController | null = null;
  const set = (patch: Partial<AssistantAccessState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const cancelVerification = () => { verification?.abort(); verification = null; };
  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot: () => state,
    async checkConnection() {
      connection?.abort(); const controller = new AbortController(); connection = controller;
      set({ checking: true, error: "" });
      try {
        const result = await requestGemini<{ configured: boolean; model?: string }>(request, { signal: controller.signal }, 12_000);
        if (controller.signal.aborted) return;
        set({ ready: result.configured === true, model: result.model || "Gemini", checking: false,
          status: result.configured === true ? "Server ready. Verify your workspace code to connect." : "Chat connection is not configured." });
      } catch (error) {
        if (!controller.signal.aborted) set({ ready: false, checking: false, status: "Chat connection unavailable.", error: error instanceof Error ? error.message : "Connection check failed." });
      }
    },
    setCode(code: string) { cancelVerification(); set({ code, verified: false, verifying: false, error: "" }); },
    setConsent(consent: boolean) { cancelVerification(); set({ consent, verifying: false, error: "" }); },
    invalidate(error: string) { cancelVerification(); set({ verified: false, verifying: false, error }); },
    answerReceived() { set({ status: "Answer received", error: "" }); },
    async verify() {
      if (!state.ready || !state.consent || state.code.trim().length < 16 || state.verifying) return false;
      const controller = new AbortController(); verification = controller;
      set({ verifying: true, verified: false, error: "" });
      try {
        const result = await requestGemini<{ verified: boolean }>(request, { method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json", "x-demo-access-code": state.code.trim() },
          body: JSON.stringify({ operation: "verify_access" }) }, 12_000);
        if (controller.signal.aborted) return false;
        if (result.verified !== true) throw new Error("Workspace access could not be verified.");
        set({ verified: true, verifying: false, status: "Workspace access verified. The answer connection is checked when you send a question." });
        return true;
      } catch (error) {
        if (!controller.signal.aborted) set({ verified: false, verifying: false, error: error instanceof Error ? error.message : "Access verification failed." });
        return false;
      }
    },
    forget() { cancelVerification(); set({ code: "", consent: false, verified: false, verifying: false, error: "", status: "Enter your workspace code to reconnect." }); },
    dispose() { connection?.abort(); cancelVerification(); set({ code: "", consent: false, verified: false, verifying: false }); },
  };
}
