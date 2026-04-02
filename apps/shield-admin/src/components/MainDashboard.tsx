import { useState, useEffect, useCallback } from "react";
import { renderToString } from "react-dom/server";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L, { LatLngExpression } from "leaflet";
import {
  PiBusBold,
  PiStudentBold,
  PiMapPinFill,
  PiMapTrifoldBold,
  PiSteeringWheelBold,
  PiListChecksBold,
  PiHandTapBold,
  PiXBold,
} from "react-icons/pi";
import { supabase } from "../supabase";
import type {
  Bus,
  BusEtaPrediction,
  BusLocation,
  BusRouteRecommendation,
  RouteOption,
  Student,
  RouteStop,
} from "../supabase";

import FleetPanel from "./FleetPanel";
import DriverPanel from "./DriverPanel";
import StudentPanel from "./StudentPanel";
import RouteBuilder from "./RouteBuilder";
import TripAssignmentPanel from "./TripAssignmentPanel";

// ─── Icons ───
/** Helper to render a React Icon to a Leaflet DivIcon */
function renderReactIcon(
  component: React.ReactNode,
  className: string,
  size: [number, number],
  anchor: [number, number],
) {
  return L.divIcon({
    className: className,
    html: renderToString(
      <div className={`${className}-inner`}>{component}</div>,
    ),
    iconSize: size,
    iconAnchor: anchor,
    popupAnchor: [0, -anchor[1]],
  });
}

function getBusIcon(isMoving: boolean) {
  return renderReactIcon(
    <PiBusBold size={32} color="white" />,
    `bus-marker ${isMoving ? "bus-moving" : "bus-idle"}`,
    [48, 48],
    [24, 24],
  );
}

function createStopIcon(number: number) {
  return L.divIcon({
    className: "stop-marker",
    html: `<div class="stop-marker-inner"><span>${number}</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

const studentIcon = renderReactIcon(
  <PiStudentBold size={24} color="white" />,
  "student-marker",
  [42, 42],
  [21, 21],
);

const placementIcon = renderReactIcon(
  <PiMapPinFill size={32} color="white" />,
  "placement-marker",
  [52, 52],
  [26, 52],
);

// ─── Tabs ───
type TabId = "routes" | "fleet" | "students" | "drivers" | "trips";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "routes", label: "Routes", icon: <PiMapTrifoldBold /> },
  { id: "fleet", label: "Fleet", icon: <PiBusBold /> },
  { id: "students", label: "Students", icon: <PiStudentBold /> },
  { id: "drivers", label: "Drivers", icon: <PiSteeringWheelBold /> },
  { id: "trips", label: "Trips", icon: <PiListChecksBold /> },
];

// ─── Map sub-components ───
function FollowBus({ center }: { center: LatLngExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, map.getZoom(), { animate: true, duration: 1.5 });
    }
  }, [center, map]);
  return null;
}

/**
 * Handles map click events for placing stops/students.
 * Calls Nominatim reverse geocoding to get the address from lat/lng.
 */
function MapClickHandler({
  onClick,
}: {
  onClick: ((lat: number, lng: number, address: string) => void) | null;
}) {
  useMapEvents({
    click: async (e) => {
      if (!onClick) return;
      const { lat, lng } = e.latlng;

      // Reverse geocode via Nominatim
      let address = "";
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
          {
            headers: {
              "User-Agent": "ShieldTrack-Admin/1.0",
            },
          },
        );
        const data = await res.json();
        address = data.display_name || "";
      } catch {
        address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }

      onClick(lat, lng, address);
    },
  });
  return null;
}

// ─── Map persistence: saves/restores map center + zoom to localStorage ───
const MAP_STORAGE_KEY = "shieldtrack_map_view";

interface SavedMapView {
  lat: number;
  lng: number;
  zoom: number;
}

function getSavedMapView(): SavedMapView | null {
  try {
    const raw = localStorage.getItem(MAP_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

function MapPersistence() {
  const map = useMap();

  useEffect(() => {
    // Restore saved view
    const saved = getSavedMapView();
    if (saved) {
      map.setView([saved.lat, saved.lng], saved.zoom);
    } else {
      // First visit: use browser geolocation
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            map.flyTo([pos.coords.latitude, pos.coords.longitude], 14, {
              animate: true,
              duration: 1.5,
            });
          },
          () => {
            /* denied or unavailable — keep default */
          },
          { timeout: 5000 },
        );
      }
    }

    // Save position whenever the map moves
    const onMoveEnd = () => {
      const center = map.getCenter();
      const view: SavedMapView = {
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom(),
      };
      localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(view));
    };

    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
    };
  }, [map]);

  return null;
}

// ─── Main Dashboard ───
interface MainDashboardProps {
  tenantId: string;
  instituteCode: string;
}

interface ApprovedReroute {
  id: string;
  busId: string;
  busLabel: string;
  routeId: string;
  estimatedMinutes: number;
  approvedAt: string;
  note: string;
}

const APPROVED_REROUTES_STORAGE_KEY = "shieldtrack_approved_reroutes_v1";

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getConfidenceMeta(confidencePct: number | null): {
  label: string;
  badgeClass: string;
} {
  if (confidencePct == null) {
    return {
      label: "No estimate yet",
      badgeClass: "bg-gray-100 text-gray-600",
    };
  }

  if (confidencePct >= 80) {
    return {
      label: "High confidence",
      badgeClass: "bg-emerald-100 text-emerald-700",
    };
  }

  if (confidencePct >= 60) {
    return {
      label: "Medium confidence",
      badgeClass: "bg-amber-100 text-amber-700",
    };
  }

  return {
    label: "Low confidence",
    badgeClass: "bg-rose-100 text-rose-700",
  };
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--";
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function loadApprovedReroutes(): ApprovedReroute[] {
  try {
    const raw = localStorage.getItem(APPROVED_REROUTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ApprovedReroute[]) : [];
  } catch {
    return [];
  }
}

function isNewerRecord(
  currentTs: string | null | undefined,
  incomingTs: string | null | undefined,
): boolean {
  const current = Date.parse(currentTs ?? "");
  const incoming = Date.parse(incomingTs ?? "");
  if (Number.isNaN(incoming)) return false;
  if (Number.isNaN(current)) return true;
  return incoming >= current;
}

export default function MainDashboard({
  tenantId,
  instituteCode,
}: MainDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>("routes");

  // Live tracking state
  const [buses, setBuses] = useState<Record<string, BusLocation>>({});
  const [fleetList, setFleetList] = useState<Bus[]>([]);
  const [etaByBus, setEtaByBus] = useState<Record<string, BusEtaPrediction>>(
    {},
  );
  const [routeSuggestionsByBus, setRouteSuggestionsByBus] = useState<
    Record<string, BusRouteRecommendation>
  >({});
  const [selectedInsightBusId, setSelectedInsightBusId] = useState("");
  const [approvedReroutes, setApprovedReroutes] = useState<ApprovedReroute[]>(
    [],
  );

  // Map interaction state
  const [mapClickHandler, setMapClickHandler] = useState<
    ((lat: number, lng: number, address: string) => void) | null
  >(null);

  // Route builder map overlays
  const [builderStops, setBuilderStops] = useState<RouteStop[]>([]);
  const [builderPolyline, setBuilderPolyline] = useState<[number, number][]>(
    [],
  );

  // Students for map overlay
  const [allStudents, setAllStudents] = useState<Student[]>([]);

  // Placement preview
  const [placementPreview, setPlacementPreview] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Track if map click is active
  const mapClickActive = mapClickHandler !== null;

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
        if (!next[row.bus_id]) {
          next[row.bus_id] = row;
        }
      });
      setEtaByBus(next);
    }

    if (recRes.data) {
      const next: Record<string, BusRouteRecommendation> = {};
      recRes.data.forEach((row) => {
        if (!next[row.bus_id]) {
          next[row.bus_id] = row;
        }
      });
      setRouteSuggestionsByBus(next);
    }
  }, []);

  useEffect(() => {
    setApprovedReroutes(loadApprovedReroutes());
  }, []);

  useEffect(() => {
    localStorage.setItem(
      APPROVED_REROUTES_STORAGE_KEY,
      JSON.stringify(approvedReroutes.slice(0, 30)),
    );
  }, [approvedReroutes]);

  useEffect(() => {
    fetchFleet();
    fetchStudents();

    const loadInitialData = async () => {
      const { data } = await supabase
        .from("latest_bus_locations")
        .select("*")
        .eq("tenant_id", tenantId);

      if (data) {
        const initialMap: Record<string, BusLocation> = {};
        data.forEach((b: BusLocation) => {
          initialMap[b.bus_id] = b;
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
              if (busIdKey) {
                const copy = { ...prev };
                delete copy[busIdKey];
                return copy;
              }
              return prev;
            });
          } else {
            const newLoc = payload.new as BusLocation;
            if (newLoc.bus_id) {
              setBuses((prev) => ({ ...prev, [newLoc.bus_id]: newLoc }));
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bus_eta_predictions",
        },
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
  }, [fetchFleet, fetchStudents, tenantId]);

  // Refresh students when switching to students or routes tab
  useEffect(() => {
    if (activeTab === "students" || activeTab === "routes") {
      fetchStudents();
    }
    if (activeTab === "fleet") {
      fetchFleet();
    }
  }, [activeTab, fetchStudents, fetchFleet]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Map click handlers
  const handleRequestMapClick = useCallback(
    (callback: (lat: number, lng: number, address: string) => void) => {
      setPlacementPreview(null);
      setMapClickHandler(() => (lat: number, lng: number, address: string) => {
        setPlacementPreview({ lat, lng });
        callback(lat, lng, address);
        setMapClickHandler(null);
      });
    },
    [],
  );

  const handleCancelMapClick = useCallback(() => {
    setMapClickHandler(null);
    setPlacementPreview(null);
  }, []);

  // Map data
  const activeBuses = Object.values(buses);
  const activeBusIds = Object.keys(buses);
  const activeBusIdsKey = activeBusIds.join("|");

  useEffect(() => {
    fetchLatestInsights(activeBusIds);
  }, [activeBusIdsKey, fetchLatestInsights]);

  useEffect(() => {
    if (activeBusIds.length === 0) {
      setSelectedInsightBusId("");
      return;
    }
    if (!selectedInsightBusId || !activeBusIds.includes(selectedInsightBusId)) {
      setSelectedInsightBusId(activeBusIds[0]);
    }
  }, [activeBusIdsKey, selectedInsightBusId]);

  const selectedBusId = selectedInsightBusId;
  const selectedBusDetails = fleetList.find((bus) => bus.id === selectedBusId);
  const selectedEta = selectedBusId ? etaByBus[selectedBusId] : undefined;
  const selectedRecommendation = selectedBusId
    ? routeSuggestionsByBus[selectedBusId]
    : undefined;
  const selectedRouteOptions = Array.isArray(
    selectedRecommendation?.routes_json,
  )
    ? (selectedRecommendation?.routes_json as RouteOption[])
    : [];
  const recommendedRoute =
    selectedRouteOptions.find((option) => option.is_recommended) ??
    selectedRouteOptions[0];

  const approveRoute = (route: RouteOption) => {
    if (!selectedBusId) return;
    const busLabel =
      selectedBusDetails?.plate_number ?? `Bus ${selectedBusId.slice(0, 8)}`;

    const record: ApprovedReroute = {
      id: `${selectedBusId}-${route.route_id}-${Date.now()}`,
      busId: selectedBusId,
      busLabel,
      routeId: route.route_id,
      estimatedMinutes: route.estimated_minutes,
      approvedAt: new Date().toISOString(),
      note: route.notes,
    };

    setApprovedReroutes((prev) => [record, ...prev].slice(0, 30));
  };

  const dismissSuggestion = () => {
    if (!selectedBusId) return;
    setRouteSuggestionsByBus((prev) => {
      const next = { ...prev };
      delete next[selectedBusId];
      return next;
    });
  };

  const saved = getSavedMapView();
  const defaultCenter: LatLngExpression = saved
    ? [saved.lat, saved.lng]
    : activeBuses.length > 0
      ? [activeBuses[0].lat, activeBuses[0].lng]
      : [31.326, 75.5762]; // Jalandhar fallback
  const defaultZoom = saved?.zoom ?? 13;

  // Determine which students to show on map
  const showStudentsOnMap = activeTab === "students" || activeTab === "routes";
  const studentsWithLocation = allStudents.filter(
    (s) => s.lat != null && s.lng != null,
  );

  return (
    <div className="flex h-screen w-screen m-0 bg-[#f5f7fa]">
      {/* ─── SIDEBAR ─── */}
      <div className="w-95 bg-white text-gray-800 shadow-[4px_0_15px_rgba(0,0,0,0.05)] z-10 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-[#1a237e] text-white flex justify-between items-center shrink-0">
          <div>
            <h1 className="m-0 text-xl font-extrabold tracking-tight">
              ShieldTrack
            </h1>
            <p className="m-0 mt-0.5 opacity-80 text-xs">{instituteCode}</p>
          </div>
          <button
            onClick={handleLogout}
            className="px-2.5 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-white text-xs font-semibold border-none cursor-pointer transition backdrop-blur"
          >
            Logout
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 shrink-0 bg-gray-50">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-xs font-semibold border-none cursor-pointer transition flex flex-col items-center gap-0.5 ${
                activeTab === tab.id
                  ? "bg-white text-[#1a237e] border-b-2 border-b-[#1a237e] shadow-sm"
                  : "bg-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="text-lg flex items-center justify-center h-5">
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Map Click Banner */}
        {mapClickActive && (
          <div className="px-4 py-2.5 bg-amber-400 text-amber-900 text-xs font-bold flex items-center justify-between shrink-0 animate-pulse">
            <span className="flex items-center gap-2">
              <PiHandTapBold size={16} /> Click on the map to place a point
            </span>
            <button
              onClick={handleCancelMapClick}
              className="px-2 py-1 bg-amber-600 text-white text-xs rounded-lg flex items-center gap-1 border-none cursor-pointer hover:bg-amber-700 transition"
            >
              <PiXBold /> Cancel
            </button>
          </div>
        )}

        {/* Active Panel */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "routes" && (
            <RouteBuilder
              tenantId={tenantId}
              onRequestMapClick={handleRequestMapClick}
              onCancelMapClick={handleCancelMapClick}
              onStopsChange={setBuilderStops}
              onPolylineChange={setBuilderPolyline}
            />
          )}
          {activeTab === "fleet" && <FleetPanel tenantId={tenantId} />}
          {activeTab === "students" && (
            <StudentPanel
              tenantId={tenantId}
              onRequestMapClick={handleRequestMapClick}
              onCancelMapClick={handleCancelMapClick}
            />
          )}
          {activeTab === "drivers" && <DriverPanel tenantId={tenantId} />}
          {activeTab === "trips" && <TripAssignmentPanel tenantId={tenantId} />}
        </div>

        {/* Status bar */}
        <div className="px-4 py-2 border-t border-gray-200 text-[10px] uppercase font-bold text-gray-400 flex justify-between shrink-0 bg-gray-50">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <PiBusBold size={14} className="text-blue-600" /> Fleet:{" "}
              {fleetList.length}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Tracking:{" "}
              {activeBuses.length}
            </span>
          </span>
          <span className="flex items-center gap-1">
            <PiStudentBold size={14} className="text-violet-600" />{" "}
            {allStudents.length} students
          </span>
        </div>
      </div>

      {/* ─── MAP ─── */}
      <div className="flex-1 relative">
        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          className={`h-full w-full ${mapClickActive ? "crosshair-cursor" : ""}`}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {/* Persist & restore map position */}
          <MapPersistence />

          {/* Map click handler */}
          <MapClickHandler onClick={mapClickHandler} />

          {/* Follow first active bus */}
          {activeTab === "fleet" && activeBuses.length > 0 && (
            <FollowBus center={[activeBuses[0].lat, activeBuses[0].lng]} />
          )}

          {/* ─── Live bus markers (always shown) ─── */}
          {activeBuses.map((busLoc) => {
            const busDetails = fleetList.find((b) => b.id === busLoc.bus_id);
            const title = busDetails ? busDetails.plate_number : "Unknown Bus";
            const eta = etaByBus[busLoc.bus_id];
            const etaMinutes = toNumber(eta?.eta_minutes);
            const confidencePct = toNumber(eta?.confidence_pct);
            const confidence = getConfidenceMeta(confidencePct);
            return (
              <Marker
                key={`bus-${busLoc.bus_id}`}
                position={[busLoc.lat, busLoc.lng]}
                icon={getBusIcon(busLoc.speed_kmh > 0)}
              >
                <Popup>
                  <b>{title}</b>
                  <br />
                  Speed: {busLoc.speed_kmh} km/h
                  <br />
                  Arrival estimate:{" "}
                  {etaMinutes != null
                    ? `${Math.round(etaMinutes)} min`
                    : "Waiting for update"}
                  <br />
                  <span
                    style={{
                      color:
                        confidencePct == null
                          ? "#4b5563"
                          : confidencePct >= 80
                            ? "#047857"
                            : confidencePct >= 60
                              ? "#b45309"
                              : "#b91c1c",
                    }}
                  >
                    Confidence: {confidence.label}
                    {confidencePct != null
                      ? ` (${Math.round(confidencePct)}%)`
                      : ""}
                  </span>
                  <br />
                  Last ping: {formatTime(busLoc.recorded_at)}
                </Popup>
              </Marker>
            );
          })}

          {/* ─── Student pins ─── */}
          {showStudentsOnMap &&
            studentsWithLocation.map((student) => (
              <Marker
                key={`student-${student.id}`}
                position={[student.lat!, student.lng!]}
                icon={studentIcon}
              >
                <Popup>
                  <b>{student.name}</b>
                  <br />
                  {student.address || "No address"}
                  <br />
                  {student.route_id ? (
                    <span style={{ color: "#4338ca" }}>Assigned</span>
                  ) : (
                    <span style={{ color: "#dc2626" }}>Unassigned</span>
                  )}
                </Popup>
              </Marker>
            ))}

          {/* ─── Route builder: stops ─── */}
          {activeTab === "routes" &&
            builderStops.map((stop, i) => (
              <Marker
                key={`stop-${i}`}
                position={[stop.lat, stop.lng]}
                icon={createStopIcon(i + 1)}
              >
                <Popup>
                  <b>
                    Stop {i + 1}: {stop.name}
                  </b>
                </Popup>
              </Marker>
            ))}

          {/* ─── Route builder: polyline ─── */}
          {activeTab === "routes" && builderPolyline.length >= 2 && (
            <Polyline
              positions={builderPolyline}
              pathOptions={{
                color: "#3b82f6",
                weight: 4,
                opacity: 0.8,
                dashArray: "10, 6",
              }}
            />
          )}

          {/* ─── Placement preview marker ─── */}
          {placementPreview && (
            <Marker
              position={[placementPreview.lat, placementPreview.lng]}
              icon={placementIcon}
            />
          )}
        </MapContainer>

        {/* Live ETA + route recommendation panel */}
        {activeTab === "fleet" && (
          <div className="absolute top-4 right-4 w-88 max-w-136 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl border border-gray-200 z-1000 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-linear-to-r from-sky-50 to-indigo-50">
              <p className="m-0 text-sm font-bold text-gray-800">
                Live travel insights
              </p>
              <p className="m-0 text-xs text-gray-500 mt-0.5">
                Arrival estimate and route decisions for active buses
              </p>
            </div>

            <div className="p-4 flex flex-col gap-3">
              {activeBusIds.length === 0 ? (
                <p className="m-0 text-sm text-gray-500">
                  No active buses yet. Start a trip to see ETA and route
                  suggestions.
                </p>
              ) : (
                <>
                  <label className="text-xs font-semibold text-gray-600">
                    Active bus
                  </label>
                  <select
                    value={selectedBusId}
                    onChange={(e) => setSelectedInsightBusId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                  >
                    {activeBusIds.map((busId) => {
                      const details = fleetList.find((bus) => bus.id === busId);
                      return (
                        <option key={busId} value={busId}>
                          {details?.plate_number ?? `Bus ${busId.slice(0, 8)}`}
                        </option>
                      );
                    })}
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-sky-100 bg-sky-50 p-3">
                      <p className="m-0 text-[11px] uppercase tracking-wide text-sky-700 font-semibold">
                        Arrival estimate
                      </p>
                      <p className="m-0 mt-1 text-xl font-extrabold text-sky-900">
                        {toNumber(selectedEta?.eta_minutes) != null
                          ? `${Math.round(toNumber(selectedEta?.eta_minutes) as number)} min`
                          : "--"}
                      </p>
                      <p className="m-0 mt-1 text-[11px] text-sky-700">
                        Updated {formatTime(selectedEta?.predicted_at)}
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="m-0 text-[11px] uppercase tracking-wide text-gray-600 font-semibold">
                        Confidence
                      </p>
                      <div className="mt-1">
                        {(() => {
                          const confidencePct = toNumber(
                            selectedEta?.confidence_pct,
                          );
                          const meta = getConfidenceMeta(confidencePct);
                          return (
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${meta.badgeClass}`}
                            >
                              {meta.label}
                              {confidencePct != null
                                ? ` (${Math.round(confidencePct)}%)`
                                : ""}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="m-0 text-sm font-semibold text-indigo-900">
                        Recommended route
                      </p>
                      {selectedRecommendation?.recommended_at && (
                        <span className="text-[11px] text-indigo-700">
                          Updated{" "}
                          {formatTime(selectedRecommendation.recommended_at)}
                        </span>
                      )}
                    </div>

                    {recommendedRoute ? (
                      <>
                        <p className="m-0 mt-1 text-sm text-indigo-900">
                          {recommendedRoute.route_id} -{" "}
                          {Math.round(recommendedRoute.estimated_minutes)} min
                        </p>
                        <p className="m-0 mt-1 text-xs text-indigo-700">
                          {recommendedRoute.notes ||
                            "Suggested as the quickest option right now."}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => approveRoute(recommendedRoute)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold border-none cursor-pointer hover:bg-indigo-700 transition"
                          >
                            Approve route
                          </button>
                          <button
                            onClick={dismissSuggestion}
                            className="px-3 py-1.5 rounded-lg bg-white text-gray-700 text-xs font-semibold border border-gray-300 cursor-pointer hover:bg-gray-50 transition"
                          >
                            Dismiss
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="m-0 mt-1 text-xs text-indigo-700">
                        No route suggestion yet for this bus.
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="m-0 text-sm font-semibold text-gray-800">
                      Approved reroutes
                    </p>
                    {approvedReroutes.length === 0 ? (
                      <p className="m-0 mt-1 text-xs text-gray-500">
                        Approved routes will appear here.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-col gap-2 max-h-44 overflow-y-auto">
                        {approvedReroutes.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2"
                          >
                            <p className="m-0 text-xs font-semibold text-gray-800">
                              {item.busLabel} - {item.routeId}
                            </p>
                            <p className="m-0 text-[11px] text-gray-600 mt-0.5">
                              ETA {Math.round(item.estimatedMinutes)} min ·
                              Approved {formatTime(item.approvedAt)}
                            </p>
                            {item.note ? (
                              <p className="m-0 text-[11px] text-gray-500 mt-0.5">
                                {item.note}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Map Legend */}
        {showStudentsOnMap && (
          <div className="absolute bottom-6 right-4 bg-white/95 backdrop-blur-sm rounded-xl p-3 shadow-lg z-1000 border border-gray-200">
            <p className="m-0 mb-1.5 text-xs font-bold text-gray-700">Legend</p>
            <div className="flex flex-col gap-1 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />{" "}
                Route Stops
              </div>
              <div className="flex items-center gap-2">
                <PiStudentBold size={14} className="text-violet-500" /> Students
              </div>
              <div className="flex items-center gap-2">
                <PiBusBold size={14} className="text-green-500" /> Active Buses
              </div>
              {builderPolyline.length >= 2 && (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-0.5 bg-blue-500 inline-block border-dashed border-t-2 border-t-blue-500" />{" "}
                  Route Path
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
