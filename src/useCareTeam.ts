import { useCallback, useEffect, useRef, useState } from "react";
import { cloud } from "./cloud";
import {
  publishPayload,
  type Facility,
  type TeamMember,
  type SharedIncident,
  type IncidentEvent,
  type PublishInput,
} from "./incidents";
const SYNC_ERROR = 'Could not sync the care-team workspace. Actions are unavailable until reconnected.';

export function useCareTeam(userId: string | null) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityId, setFacilityId] = useState("");
  const [incidents, setIncidents] = useState<SharedIncident[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now());
  const lock = useRef(false);
  const revision = useRef(0);
  const identity = useRef(userId);
  identity.current = userId;
  const facility = facilities.find((f) => f.id === facilityId) ?? null;
  const me = members.find((m) => m.user_id === userId) ?? null;
  const selectFacility = (id: string) => {
    if (id === facilityId) return;
    revision.current++;
    setMembers([]);
    setIncidents([]);
    setEvents([]);
    setSyncedAt(null);
    setConnected(false);
    setLoading(true);
    setFacilityId(id);
  };

  const refresh = useCallback(async () => {
    if (!cloud || !userId) return;
    const token = ++revision.current;
    const fs = await cloud
      .from("care_facilities")
      .select("*")
      .order("created_at");
    if (fs.error) throw fs.error;
    const list = fs.data as Facility[];
    const id = list.some((f) => f.id === facilityId)
      ? facilityId
      : (list[0]?.id ?? "");
    const [open, closed, team] = id
      ? await Promise.all([
          cloud
            .from("care_incidents")
            .select("*")
            .eq("facility_id", id)
            .neq("phase", "resolved")
            .order("created_at", { ascending: false })
            .limit(100),
          cloud
            .from("care_incidents")
            .select("*")
            .eq("facility_id", id)
            .eq("phase", "resolved")
            .order("updated_at", { ascending: false })
            .limit(20),
          cloud
            .from("care_members")
            .select("*")
            .eq("facility_id", id)
            .order("response_order"),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];
    for (const result of [open, closed, team])
      if (result.error) throw result.error;
    const rows = [
      ...(open.data ?? []),
      ...(closed.data ?? []),
    ] as SharedIncident[];
    const log = rows.length
      ? await cloud
          .from("care_incident_events")
          .select("*")
          .eq("facility_id", id)
          .in(
            "incident_id",
            rows.map((i) => i.id),
          )
          .order("created_at")
          .limit(2000)
      : { data: [], error: null };
    if (log.error) throw log.error;
    if (identity.current !== userId || revision.current !== token) return;
    setFacilities(list);
    setFacilityId(id);
    setIncidents(rows);
    setMembers(team.data as TeamMember[]);
    setEvents(log.data as IncidentEvent[]);
    setSyncedAt(Date.now());
    setError(current => current === SYNC_ERROR ? '' : current);
    setLoading(false);
  }, [userId, facilityId]);

  useEffect(() => {
    revision.current++;
    setFacilities([]);
    setFacilityId("");
    setMembers([]);
    setIncidents([]);
    setEvents([]);
    setSyncedAt(null);
    setError("");
    setLoading(!!userId);
  }, [userId]);
  useEffect(() => {
    let active = true;
    const load = () => {
      if (active && navigator.onLine)
        void refresh().catch(() => {
          if (active) {
            setError(SYNC_ERROR);
            setSyncedAt(null);
            setLoading(false);
          }
        });
    };
    load();
    const interval = window.setInterval(() => {
      setClock(Date.now());
      if (document.visibilityState === "visible") load();
    }, 15000);
    const offline = () => {
      setConnected(false);
      setSyncedAt(null);
    };
    window.addEventListener("online", load);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", load);
    const channel =
      cloud && userId && facilityId
        ? cloud
            .channel(`care:${facilityId}:${crypto.randomUUID()}`)
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "care_incidents",
                filter: `facility_id=eq.${facilityId}`,
              },
              load,
            )
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "care_incident_events",
                filter: `facility_id=eq.${facilityId}`,
              },
              load,
            )
            .on(
              "postgres_changes",
              {
                event: "*",
                schema: "public",
                table: "care_members",
                filter: `facility_id=eq.${facilityId}`,
              },
              load,
            )
            .subscribe((status) => {
              if (active) {
                setConnected(status === "SUBSCRIBED");
                if (status === "SUBSCRIBED") load();
              }
            })
        : null;
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("online", load);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", load);
      if (channel) void cloud?.removeChannel(channel);
    };
  }, [refresh, userId, facilityId]);

  useEffect(() => {
    if (!cloud || !facilityId || !me?.available) return;
    const heartbeat = () => {
      if (navigator.onLine && document.visibilityState === "visible")
        void cloud!.rpc("care_command", {
          action: "heartbeat",
          payload: { facility_id: facilityId },
        }).then(({error}) => { if (error) setSyncedAt(null); });
    };
    heartbeat();
    const timer = setInterval(heartbeat, 30000);
    return () => clearInterval(timer);
  }, [facilityId, me?.available]);

  const command = async (action: string, payload: Record<string, unknown>) => {
    if (!cloud || !userId)
      throw new Error("Sign in to use the care-team workspace.");
    if (!navigator.onLine)
      throw new Error("You are offline. No action was saved.");
    if (lock.current) throw new Error("Wait for the current action to finish.");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { data, error: failure } = await cloud.rpc("care_command", {
        action,
        payload: { facility_id: facilityId, ...payload },
      });
      if (failure) throw failure;
      await refresh();
      return data;
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : ((e as { message?: string })?.message ??
            "The action could not be confirmed. Refresh before retrying.");
      setError(message);
      void refresh().catch(() => {});
      throw new Error(message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const publish = async (input: PublishInput, image: string) => {
    if (!facilityId || !cloud)
      throw new Error("Connect a care-team workspace first.");
    let incident = (await command(
      "publish",
      publishPayload(facilityId, input),
    )) as SharedIncident;
    if (incident.evidence_path) return incident;
    const path = `${facilityId}/${userId}/${incident.id}.jpg`;
    try {
      const blob = await (await fetch(image)).blob();
      const upload = await cloud.storage
        .from("care-evidence")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      // A previous attempt may have uploaded successfully before losing its response.
      if (
        upload.error &&
        !["409", "400"].includes(String(upload.error.statusCode))
      )
        throw upload.error;
      const latest = await cloud
        .from("care_incidents")
        .select("*")
        .eq("id", incident.id)
        .single();
      if (latest.error) throw latest.error;
      incident = latest.data as SharedIncident;
      if (!incident.evidence_path)
        incident = (await command("attach_evidence", {
          id: incident.id,
          path,
          version: incident.version,
          request_id: crypto.randomUUID(),
        })) as SharedIncident;
      return incident;
    } catch {
      await refresh();
      throw new Error(
        "The concern was saved, but its image was not attached. Retry sending to attach the image without creating a duplicate.",
      );
    }
  };
  const act = (
    incident: SharedIncident,
    action: "acknowledge" | "arrive" | "resolve" | "decline" | "supervision_check" | "nursing_check",
    note = "",
  ) =>
    command(action, {
      id: incident.id,
      version: incident.version,
      request_id: crypto.randomUUID(),
      note,
    });
  const stale = !syncedAt || clock - syncedAt > 45000 || !navigator.onLine;
  return {
    userId,
    facilities,
    facility,
    facilityId,
    setFacilityId: selectFacility,
    incidents,
    members,
    events,
    me,
    error,
    setError,
    busy,
    loading,
    connected,
    syncedAt,
    stale,
    clock,
    refresh,
    command,
    publish,
    act,
  };
}
export type CareTeam = ReturnType<typeof useCareTeam> & { mode?: "playback" };
