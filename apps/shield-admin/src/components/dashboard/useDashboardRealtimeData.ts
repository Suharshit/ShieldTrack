import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../supabase";
import type {
  Bus,
  BusEtaPrediction,
  BusLocation,
  BusRouteRecommendation,
  Route,
  Student,
} from "../../supabase";
import { isNewerRecord } from "./dashboard-utils";

interface UseDashboardRealtimeDataArgs {
  tenantId: string;
}

export default function useDashboardRealtimeData({
  tenantId,
}: UseDashboardRealtimeDataArgs) {
  const [buses, setBuses] = useState<Record<string, BusLocation>>({});
  const [fleetList, setFleetList] = useState<Bus[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [routesCatalog, setRoutesCatalog] = useState<Route[]>([]);
  const [etaByBus, setEtaByBus] = useState<Record<string, BusEtaPrediction>>(
    {},
  );
  const [routeSuggestionsByBus, setRouteSuggestionsByBus] = useState<
    Record<string, BusRouteRecommendation>
  >({});

  const fetchFleet = useCallback(async () => {
    const { data } = await supabase
      .from("buses")
      .select("*")
      .eq("tenant_id", tenantId);
    if (data) setFleetList(data);
  }, [tenantId]);

  const fetchStudents = useCallback(async () => {
    const { data } = await supabase
      .from("students")
      .select("*")
      .eq("tenant_id", tenantId);
    if (data) setAllStudents(data);
  }, [tenantId]);

  const fetchRoutes = useCallback(async () => {
    const { data } = await supabase
      .from("routes")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (data) setRoutesCatalog(data);
  }, [tenantId]);

  const fetchLatestInsights = useCallback(async (busIds: string[]) => {
    if (busIds.length === 0) {
      setEtaByBus({});
      setRouteSuggestionsByBus({});
      return;
    }

    const [etaRes, recRes] = await Promise.all([
      supabase
        .from("bus_eta_predictions")
        .select("*")
        .in("bus_id", busIds)
        .order("predicted_at", { ascending: false })
        .limit(500),
      supabase
        .from("bus_route_recommendations")
        .select("*")
        .in("bus_id", busIds)
        .order("recommended_at", { ascending: false })
        .limit(500),
    ]);

    if (etaRes.data) {
      const next: Record<string, BusEtaPrediction> = {};
      etaRes.data.forEach((row) => {
        if (!next[row.bus_id]) next[row.bus_id] = row;
      });
      setEtaByBus(next);
    }

    if (recRes.data) {
      const next: Record<string, BusRouteRecommendation> = {};
      recRes.data.forEach((row) => {
        if (!next[row.bus_id]) next[row.bus_id] = row;
      });
      setRouteSuggestionsByBus(next);
    }
  }, []);

  useEffect(() => {
    fetchFleet();
    fetchStudents();
    fetchRoutes();

    const loadInitialData = async () => {
      const { data } = await supabase
        .from("latest_bus_locations")
        .select("*")
        .eq("tenant_id", tenantId);

      if (data) {
        const initialMap: Record<string, BusLocation> = {};
        data.forEach((item: BusLocation) => {
          initialMap[item.bus_id] = item;
        });
        setBuses(initialMap);
      }
    };

    loadInitialData();

    const subscription = supabase
      .channel("fleet-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bus_locations",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            setBuses((prev) => {
              const busIdKey = Object.keys(prev).find(
                (key) => prev[key].id === oldId,
              );
              if (!busIdKey) return prev;
              const next = { ...prev };
              delete next[busIdKey];
              return next;
            });
          } else {
            const incoming = payload.new as BusLocation;
            if (incoming.bus_id) {
              setBuses((prev) => ({ ...prev, [incoming.bus_id]: incoming }));
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bus_eta_predictions" },
        (payload) => {
          const incoming = payload.new as BusEtaPrediction;
          if (!incoming?.bus_id) return;
          setEtaByBus((prev) => {
            const current = prev[incoming.bus_id];
            if (
              current &&
              !isNewerRecord(current.predicted_at, incoming.predicted_at)
            ) {
              return prev;
            }
            return { ...prev, [incoming.bus_id]: incoming };
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bus_route_recommendations",
        },
        (payload) => {
          const incoming = payload.new as BusRouteRecommendation;
          if (!incoming?.bus_id) return;
          setRouteSuggestionsByBus((prev) => {
            const current = prev[incoming.bus_id];
            if (
              current &&
              !isNewerRecord(current.recommended_at, incoming.recommended_at)
            ) {
              return prev;
            }
            return { ...prev, [incoming.bus_id]: incoming };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [fetchFleet, fetchStudents, fetchRoutes, tenantId]);

  return {
    buses,
    fleetList,
    allStudents,
    routesCatalog,
    etaByBus,
    routeSuggestionsByBus,
    setRouteSuggestionsByBus,
    fetchFleet,
    fetchStudents,
    fetchRoutes,
    fetchLatestInsights,
  };
}
