import { useState, useEffect, useCallback, FormEvent } from "react";
import {
  PiListChecksBold,
  PiBusBold,
  PiUserCircleBold,
  PiCalendarBold,
  PiWarningBold,
  PiTrashBold,
  PiPlusBold,
} from "react-icons/pi";
import { supabase } from "../supabase";
import type { Bus, Route, User, TripAssignment } from "../supabase";

interface TripAssignmentPanelProps {
  tenantId: string;
}

interface TripAssignmentWithDetails extends TripAssignment {
  buses?: { plate_number: string } | null;
  routes?: { name: string } | null;
  users?: { email: string | null } | null;
}

export default function TripAssignmentPanel({ tenantId }: TripAssignmentPanelProps) {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<TripAssignmentWithDetails[]>([]);

  const [selectedBus, setSelectedBus] = useState("");
  const [selectedRoute, setSelectedRoute] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [assignDate, setAssignDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const [busRes, routeRes, driverRes, assignRes] = await Promise.all([
      supabase.from("buses").select("*").eq("tenant_id", tenantId).order("plate_number"),
      supabase.from("routes").select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("users").select("*").eq("tenant_id", tenantId).eq("role", "driver").order("email"),
      supabase
        .from("trip_assignments")
        .select("*, buses(plate_number), routes(name), users:driver_id(email)")
        .eq("tenant_id", tenantId)
        .order("assigned_date", { ascending: false })
        .limit(20),
    ]);

    if (busRes.data) setBuses(busRes.data);
    if (routeRes.data) setRoutes(routeRes.data);
    if (driverRes.data) setDrivers(driverRes.data);
    if (assignRes.data) setAssignments(assignRes.data as TripAssignmentWithDetails[]);
  }, [tenantId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedBus || !selectedRoute || !selectedDriver) {
      return alert("Please select a bus, route, and driver.");
    }

    setSaving(true);
    const { error } = await supabase.from("trip_assignments").insert({
      tenant_id: tenantId,
      bus_id: selectedBus,
      route_id: selectedRoute,
      driver_id: selectedDriver,
      assigned_date: assignDate,
    });

    if (error) alert("Error creating assignment: " + error.message);
    else {
      setSelectedBus("");
      setSelectedRoute("");
      setSelectedDriver("");
      fetchData();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this trip assignment?")) return;
    const { error } = await supabase.from("trip_assignments").delete().eq("id", id);
    if (error) alert("Error: " + error.message);
    else fetchData();
  };

  const hasAnyData = buses.length > 0 && routes.length > 0 && drivers.length > 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Warning if prerequisites missing */}
      {!hasAnyData && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-800">
          <p className="m-0 font-bold mb-1 flex items-center gap-1.5">
            <PiWarningBold size={16} />
            <span>Prerequisites needed</span>
          </p>
          <ul className="m-0 pl-4">
            {buses.length === 0 && <li>Register at least one bus (Fleet tab)</li>}
            {routes.length === 0 && <li>Create at least one route (Routes tab)</li>}
            {drivers.length === 0 && <li>Register at least one driver (Drivers tab)</li>}
          </ul>
        </div>
      )}

      {/* Create Assignment Form */}
      <div className="bg-sky-50 rounded-xl p-4 border border-sky-200">
        <h3 className="m-0 mb-3 text-sm font-bold text-[#1a237e] flex items-center gap-1.5">
          <PiListChecksBold size={18} className="text-sky-600" />
          <span>Create Trip Assignment</span>
        </h3>
        <form onSubmit={handleCreate} className="flex flex-col gap-2.5">
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-800 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">Select Route...</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          <select
            value={selectedBus}
            onChange={(e) => setSelectedBus(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-800 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">Select Bus...</option>
            {buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.plate_number} ({b.capacity} seats)
              </option>
            ))}
          </select>

          <select
            value={selectedDriver}
            onChange={(e) => setSelectedDriver(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-800 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">Select Driver...</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.email || `Driver ${d.id.slice(0, 8)}`}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={assignDate}
            onChange={(e) => setAssignDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-800 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />

          <button
            type="submit"
            disabled={saving || !hasAnyData}
            className="px-4 py-2 bg-sky-600 text-white font-semibold border-none rounded-lg cursor-pointer hover:bg-sky-700 transition text-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? "..." : <><PiPlusBold size={16} /> Create Assignment</>}
          </button>
        </form>
      </div>

      {/* Assignments List */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="m-0 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
          Assignments ({assignments.length})
        </h3>
        {assignments.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No trip assignments yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="m-0 font-bold text-gray-800 text-sm">
                      {(a.routes as any)?.name || "Unknown Route"}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2 text-[10px] font-semibold uppercase text-gray-400">
                      <span className="flex items-center gap-1">
                        <PiBusBold size={12} className="text-blue-500" />{" "}
                        {(a.buses as any)?.plate_number || "?"}
                      </span>
                      <span className="flex items-center gap-1">
                        <PiUserCircleBold size={12} className="text-emerald-500" />{" "}
                        {(a.users as any)?.email || "?"}
                      </span>
                      <span className="flex items-center gap-1">
                        <PiCalendarBold size={12} className="text-amber-500" />{" "}
                        {a.assigned_date}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition bg-transparent border-none cursor-pointer text-xs shrink-0"
                  >
                    <PiTrashBold />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
