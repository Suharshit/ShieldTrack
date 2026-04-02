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
import type { Bus, BusLocation, Student, RouteStop } from "../supabase";

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

export default function MainDashboard({
  tenantId,
  instituteCode,
}: MainDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>("routes");

  // Live tracking state
  const [buses, setBuses] = useState<Record<string, BusLocation>>({});
  const [fleetList, setFleetList] = useState<Bus[]>([]);

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
      <div className="w-[380px] bg-white text-gray-800 shadow-[4px_0_15px_rgba(0,0,0,0.05)] z-10 flex flex-col">
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
