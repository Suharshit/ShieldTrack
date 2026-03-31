import {
  useState,
  useEffect,
  useCallback,
  FormEvent,
} from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L, { LatLngExpression } from "leaflet";
import { supabase } from "./supabase";
import type { Bus, Route, BusLocation } from "./supabase";

const busIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3448/3448339.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

function FollowBus({ center }: { center: LatLngExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, map.getZoom(), { animate: true, duration: 1.5 });
    }
  }, [center, map]);
  return null;
}

export default function App() {
  const [buses, setBuses] = useState<Record<string, BusLocation>>({});
  const [fleetList, setFleetList] = useState<Bus[]>([]);
  const [routeList, setRouteList] = useState<Route[]>([]);
  
  const [instituteCode, setInstituteCode] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [inputCode, setInputCode] = useState("");

  // Forms State
  const [newPlateNumber, setNewPlateNumber] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [assignRouteId, setAssignRouteId] = useState("");

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (inputCode.trim().length > 0) {
      const code = inputCode.trim().toUpperCase();
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("institute_code", code)
        .single();
      
      if (error || !data) {
        alert("Invalid Institute Code! Tenant not found.");
      } else {
        setInstituteCode(data.institute_code);
        setTenantId(data.id);
        setIsAuthenticated(true);
      }
    }
  };

  // --- 1. REGISTER A NEW BUS ---
  const handleRegisterBus = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPlateNumber.trim() || !tenantId) return;
    const plate = newPlateNumber.trim().toUpperCase();

    const { error } = await supabase
      .from("buses")
      .insert({ plate_number: plate, tenant_id: tenantId });

    if (error) alert("Error: This Plate Number might already exist!");
    else {
      alert(`✅ Bus ${plate} registered successfully!`);
      setNewPlateNumber("");
      fetchOfficialFleet();
    }
  };

  // --- 2. REGISTER A STUDENT TO A ROUTE ---
  const handleRegisterStudent = async (e: FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !assignRouteId || !tenantId) {
      return alert("Please enter a Student Name and select a route!");
    }

    const formattedStudent = newStudentName.trim();

    const { error } = await supabase.from("students").insert({
      name: formattedStudent,
      tenant_id: tenantId,
      route_id: assignRouteId,
    });

    if (error) alert("Error registering student!");
    else {
      alert(`✅ Student ${formattedStudent} assigned correctly!`);
      setNewStudentName("");
    }
  };

  const fetchOfficialFleet = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("buses")
      .select("*")
      .eq("tenant_id", tenantId);
    if (data) setFleetList(data);
  }, [tenantId]);

  const fetchRoutes = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("routes")
      .select("*")
      .eq("tenant_id", tenantId);
    if (data) setRouteList(data);
  }, [tenantId]);

  useEffect(() => {
    if (!isAuthenticated || !tenantId) return;

    fetchOfficialFleet();
    fetchRoutes();

    const loadInitialData = async () => {
      const { data } = await supabase
        .from("bus_locations")
        .select("*")
        .eq("tenant_id", tenantId);
      if (data) {
        const initialMap: Record<string, BusLocation> = {};
        data.forEach((b: BusLocation) => (initialMap[b.bus_id] = b));
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
          const newLoc = payload.new as BusLocation;
          setBuses((prev) => ({ ...prev, [newLoc.bus_id]: newLoc }));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [fetchOfficialFleet, fetchRoutes, isAuthenticated, tenantId]);

  const activeBuses = Object.values(buses);
  const activeBusPos: LatLngExpression =
    activeBuses.length > 0
      ? [activeBuses[0].lat, activeBuses[0].lng]
      : [30.6942, 76.8606];

  // ==========================================
  // UI: LOGIN SCREEN
  // ==========================================
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <form onSubmit={handleLogin} className="bg-white p-10 rounded-xl text-center shadow-lg w-[350px]">
          <h2 className="m-0 mb-2.5 text-[#1a237e] text-2xl font-bold">
            🛡️ ShieldTrack Admin
          </h2>
          <p className="text-gray-500 mb-5">
            Enter Institute Code to Access your Fleet.
          </p>
          <input
            type="text"
            placeholder="e.g., LPU_PUNJAB"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            className="p-3 w-full mb-5 border-2 border-gray-200 rounded-lg text-gray-800 bg-white box-border focus:outline-none focus:border-[#1a237e]"
          />
          <button type="submit" className="px-5 py-3.5 bg-[#1a237e] text-white w-full border-none rounded-lg font-bold cursor-pointer transition hover:bg-opacity-90">
            Enter Dashboard
          </button>
        </form>
      </div>
    );
  }

  // ==========================================
  // UI: MAIN DASHBOARD
  // ==========================================
  return (
    <div className="flex h-screen w-screen m-0 bg-[#f5f7fa]">
      <div className="w-[380px] bg-white text-gray-800 shadow-[4px_0_15px_rgba(0,0,0,0.05)] z-10 flex flex-col">
        <div className="p-8 bg-[#1a237e] text-white">
          <h1 className="m-0 text-[28px] font-extrabold">ShieldTrack</h1>
          <p className="m-0 mt-1 opacity-90 text-sm">Institute: {instituteCode}</p>
        </div>

        {/* --- 1. BUS REGISTRATION FORM --- */}
        <div className="p-5 bg-indigo-50 border-b border-indigo-200 text-gray-800">
          <h3 className="m-0 mb-2.5 text-[15px] font-bold text-[#1a237e]">➕ Register New Vehicle</h3>
          <form
            onSubmit={handleRegisterBus}
            className="flex gap-2.5"
          >
            <input
              type="text"
              placeholder="Plate Number"
              value={newPlateNumber}
              onChange={(e) => setNewPlateNumber(e.target.value)}
              className="flex-1 p-2 rounded-md border border-gray-300 text-gray-800 bg-white"
            />
            <button type="submit" className="px-4 py-2 bg-green-500 text-black font-bold border-none rounded-md cursor-pointer hover:bg-green-600 transition">
              Add
            </button>
          </form>
        </div>

        {/* --- 2. STUDENT REGISTRATION FORM --- */}
        <div
          className="p-5 bg-fuchsia-100 border-b border-fuchsia-200 text-gray-800"
        >
          <h3 className="m-0 mb-2.5 text-[15px] font-bold text-[#1a237e]">👨‍🎓 Assign Student to Route</h3>
          <form
            onSubmit={handleRegisterStudent}
            className="flex flex-col gap-2.5"
          >
            <input
              type="text"
              placeholder="Student Name"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              className="p-2 rounded-md border border-gray-300 text-gray-800 bg-white"
            />
            <div className="flex gap-2.5">
              <select
                value={assignRouteId}
                onChange={(e) => setAssignRouteId(e.target.value)}
                className="flex-1 p-2 rounded-md border border-gray-300 text-gray-800 bg-white"
              >
                <option value="">Select a Route...</option>
                {routeList.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-4 py-2 bg-purple-600 text-white font-bold border-none rounded-md cursor-pointer hover:bg-purple-700 transition"
              >
                Assign
              </button>
            </div>
          </form>
        </div>

        <div className="p-4 px-5 border-b border-gray-200 text-sm text-gray-800">
          <p className="m-0 font-bold">
            Official Registered Fleet: {fleetList.length} Buses
          </p>
          <p className="m-0 text-green-600 font-bold">
            Currently Tracking: {activeBuses.length}
          </p>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          {activeBuses.map((busLoc) => {
            const busDetails = fleetList.find(b => b.id === busLoc.bus_id);
            const title = busDetails ? busDetails.plate_number : busLoc.bus_id.slice(0, 8);
            
            return (
            <div
              key={busLoc.bus_id}
              className="bg-white p-4 rounded-xl mb-4 border-l-[6px] border-l-green-500 border border-gray-100 shadow-sm"
            >
              <div className="flex justify-between mb-2.5">
                <span className="text-lg font-black text-black">{title}</span>
                <span
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-50 text-green-800"
                >
                  ACTIVE
                </span>
              </div>
              <p className="m-0 my-1 text-sm text-gray-600">
                💨 Speed: <b>{busLoc.speed_kmh} km/h</b>
              </p>
            </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1">
        <MapContainer
          // @ts-expect-error react-leaflet MapContainer props type mismatch
          center={activeBusPos}
          zoom={15}
          className="h-full w-full"
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {activeBuses.map((busLoc) => {
            const busDetails = fleetList.find(b => b.id === busLoc.bus_id);
            const title = busDetails ? busDetails.plate_number : "Unknown Bus";
            return (
              <Marker
                key={busLoc.bus_id}
                position={[busLoc.lat, busLoc.lng]}
                // @ts-expect-error react-leaflet types issue with icon prop
                icon={busIcon}
              >
                <Popup>
                  <b>{title}</b>
                  <br />
                  Speed: {busLoc.speed_kmh} km/h
                </Popup>
              </Marker>
            );
          })}
          <FollowBus center={activeBusPos} />
        </MapContainer>
      </div>
    </div>
  );
}
