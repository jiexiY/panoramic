import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createAssistantAccess } from "./assistantAccess";

const AssistantAccessContext = createContext<ReturnType<typeof createAssistantAccess> | null>(null);
export function AssistantAccessProvider({ children }: { children: ReactNode }) {
  const [access] = useState(() => createAssistantAccess((...args) => fetch(...args)));
  useEffect(() => { void access.checkConnection(); return () => access.dispose(); }, [access]);
  return <AssistantAccessContext.Provider value={access}>{children}</AssistantAccessContext.Provider>;
}
export function useAssistantAccess() {
  const access = useContext(AssistantAccessContext);
  if (!access) throw new Error("Panoramic chat requires its workspace access provider.");
  const state = useSyncExternalStore(access.subscribe, access.getSnapshot);
  return { access, ...state };
}
