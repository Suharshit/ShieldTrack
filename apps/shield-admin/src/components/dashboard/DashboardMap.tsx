import { useEffect } from "react";
import { renderToString } from "react-dom/server";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L, { LatLngExpression } from "leaflet";
import { PiBusBold, PiMapPinFill, PiStudentBold } from "react-icons/pi";

import type {
  Bus,
  BusEtaPrediction,
  BusLocation,
  RouteStop,
  Student,
} from "../../supabase";
import type { DashboardTabId } from "./DashboardSidebar";
import {
  formatTime,
  getConfidenceMeta,
  getSavedMapView,
  MAP_STORAGE_KEY,
  toNumber,
} from "./dashboard-utils";

interface DashboardMapProps {
  defaultCenter: LatLngExpression;
  defaultZoom: number;
  activeTab: DashboardTabId;
  mapClickActive: boolean;
  mapFocus: [number, number] | null;
  onMapClick: ((lat: number, lng: number, address: string) => void) | null;
  activeBuses: BusLocation[];
  fleetList: Bus[];
  etaByBus: Record<string, BusEtaPrediction>;
  showStudentsOnMap: boolean;
  studentsWithLocation: Student[];
  builderStops: RouteStop[];
  builderPolyline: [number, number][];
  placementPreview: { lat: number; lng: number } | null;
}

function renderReactIcon(
  component: React.ReactNode,
  className: string,
  size: [number, number],
  anchor: [number, number],
) {
  return L.divIcon({
    className,
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
    html: `<div class=\"stop-marker-inner\"><span>${number}</span></div>`,
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

function FollowBus({ center }: { center: LatLngExpression | null }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.flyTo(center, 15, { animate: true, duration: 1.5 });
    }
  }, [center, map]);

  return null;
}

function MapRefocusHandler({ focus }: { focus: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (focus) {
      map.flyTo(focus, 16, { animate: true, duration: 1.5 });
    }
  }, [focus, map]);

  return null;
}

function MapClickHandler({
  onClick,
}: {
  onClick: ((lat: number, lng: number, address: string) => void) | null;
}) {
  useMapEvents({
    click: async (event) => {
      if (!onClick) return;
      const { lat, lng } = event.latlng;

      let address = "";
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
          {
            headers: {
              "User-Agent": "ShieldTrack-Admin/1.0",
            },
          },
        );
        const data = await response.json();
        address = data.display_name || "";
      } catch {
        address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }

      onClick(lat, lng, address);
    },
  });

  return null;
}

function MapPersistence() {
  const map = useMap();

  useEffect(() => {
    const saved = getSavedMapView();
    if (saved) {
      map.setView([saved.lat, saved.lng], saved.zoom);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.flyTo([pos.coords.latitude, pos.coords.longitude], 14, {
            animate: true,
            duration: 1.5,
          });
        },
        () => {
          // noop
        },
        { timeout: 5000 },
      );
    }

    const onMoveEnd = () => {
      const center = map.getCenter();
      localStorage.setItem(
        MAP_STORAGE_KEY,
        JSON.stringify({
          lat: center.lat,
          lng: center.lng,
          zoom: map.getZoom(),
        }),
      );
    };

    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
    };
  }, [map]);

  return null;
}

export default function DashboardMap({
  defaultCenter,
  defaultZoom,
  activeTab,
  mapClickActive,
  mapFocus,
  onMapClick,
  activeBuses,
  fleetList,
  etaByBus,
  showStudentsOnMap,
  studentsWithLocation,
  builderStops,
  builderPolyline,
  placementPreview,
}: DashboardMapProps) {
  return (
    <MapContainer
      center={defaultCenter}
      zoom={defaultZoom}
      className={`h-full w-full ${mapClickActive ? "crosshair-cursor" : ""}`}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      <MapPersistence />
      <MapRefocusHandler focus={mapFocus} />
      <MapClickHandler onClick={onMapClick} />

      {activeTab === "fleet" && activeBuses.length > 0 && !mapFocus && (
        <FollowBus center={[activeBuses[0].lat, activeBuses[0].lng]} />
      )}

      {activeBuses.map((busLoc) => {
        const busDetails = fleetList.find((bus) => bus.id === busLoc.bus_id);
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

      {showStudentsOnMap &&
        studentsWithLocation.map((student) => (
          <Marker
            key={`student-${student.id}`}
            position={[student.lat as number, student.lng as number]}
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

      {activeTab === "routes" &&
        builderStops.map((stop, index) => (
          <Marker
            key={`stop-${index}`}
            position={[stop.lat, stop.lng]}
            icon={createStopIcon(index + 1)}
          >
            <Popup>
              <b>
                Stop {index + 1}: {stop.name}
              </b>
            </Popup>
          </Marker>
        ))}

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

      {placementPreview && (
        <Marker
          position={[placementPreview.lat, placementPreview.lng]}
          icon={placementIcon}
        />
      )}
    </MapContainer>
  );
}
