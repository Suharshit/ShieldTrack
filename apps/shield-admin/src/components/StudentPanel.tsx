import { useState, useEffect, useCallback, FormEvent } from "react";
import {
  PiStudentBold,
  PiMapPinFill,
  PiHourglassBold,
  PiTrashBold,
  PiMapPinLineBold,
} from "react-icons/pi";
import { supabase } from "../supabase";
import type { Student, Route } from "../supabase";

interface StudentPanelProps {
  tenantId: string;
  /** Called when admin clicks "Set Location" — parent sets map click mode */
  onRequestMapClick: (
    callback: (lat: number, lng: number, address: string) => void,
  ) => void;
  /** Cancel map click mode */
  onCancelMapClick: () => void;
}

export default function StudentPanel({
  tenantId,
  onRequestMapClick,
  onCancelMapClick,
}: StudentPanelProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [filter, setFilter] = useState<"all" | "unassigned" | string>("all");

  // Form state
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [placingOnMap, setPlacingOnMap] = useState(false);
  const [saving, setSaving] = useState(false);

  // Bulk assign
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkRouteId, setBulkRouteId] = useState("");
  const [showBulkAssign, setShowBulkAssign] = useState(false);

  const fetchStudents = useCallback(async () => {
    const { data } = await supabase
      .from("students")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (data) setStudents(data);
  }, [tenantId]);

  const fetchRoutes = useCallback(async () => {
    const { data } = await supabase
      .from("routes")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name");
    if (data) setRoutes(data);
  }, [tenantId]);

  useEffect(() => {
    fetchStudents();
    fetchRoutes();
  }, [fetchStudents, fetchRoutes]);

  const handlePlaceOnMap = () => {
    setPlacingOnMap(true);
    onRequestMapClick((clickLat, clickLng, clickAddress) => {
      setLat(clickLat);
      setLng(clickLng);
      setAddress(clickAddress);
      setPlacingOnMap(false);
    });
  };

  const handleCancelPlace = () => {
    setPlacingOnMap(false);
    onCancelMapClick();
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return alert("Please enter a student name.");
    if (lat === null || lng === null)
      return alert("Please set the student's pickup location on the map.");

    setSaving(true);
    const { error } = await supabase.from("students").insert({
      tenant_id: tenantId,
      name: name.trim(),
      address: address || null,
      lat,
      lng,
    });

    if (error) alert("Error registering student: " + error.message);
    else {
      setName("");
      setAddress("");
      setLat(null);
      setLng(null);
      fetchStudents();
    }
    setSaving(false);
  };

  const handleAssignRoute = async (studentId: string, routeId: string) => {
    const { error } = await supabase
      .from("students")
      .update({ route_id: routeId || null })
      .eq("id", studentId);
    if (error) alert("Error assigning route: " + error.message);
    else fetchStudents();
  };

  const handleBulkAssign = async () => {
    if (bulkSelected.size === 0 || !bulkRouteId) return;

    const ids = Array.from(bulkSelected);
    const { error } = await supabase
      .from("students")
      .update({ route_id: bulkRouteId })
      .in("id", ids);

    if (error) alert("Error bulk assigning: " + error.message);
    else {
      setBulkSelected(new Set());
      setBulkRouteId("");
      setShowBulkAssign(false);
      fetchStudents();
    }
  };

  const toggleBulkSelect = (id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteStudent = async (id: string, studentName: string) => {
    if (!confirm(`Remove student "${studentName}"?`)) return;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) alert("Error: " + error.message);
    else fetchStudents();
  };

  // Filter students
  const filtered = students.filter((s) => {
    if (filter === "all") return true;
    if (filter === "unassigned") return !s.route_id;
    return s.route_id === filter;
  });

  const getRouteName = (routeId: string | null) => {
    if (!routeId) return null;
    return routes.find((r) => r.id === routeId)?.name || "Unknown Route";
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Registration Form */}
      <div className="bg-violet-50 rounded-xl p-4 border border-violet-200">
        <h3 className="m-0 mb-3 text-sm font-bold text-[#1a237e] flex items-center gap-1.5">
          <PiStudentBold size={18} className="text-violet-600" />
          <span>Register Student</span>
        </h3>
        <form onSubmit={handleRegister} className="flex flex-col gap-2.5">
          <input
            type="text"
            placeholder="Student name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-800 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />

          {/* Location section */}
          {lat !== null && lng !== null ? (
            <div className="bg-white rounded-lg p-2.5 border border-violet-200 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-violet-600 uppercase flex items-center gap-1">
                  <PiMapPinFill size={14} /> Pickup Location
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLat(null);
                    setLng(null);
                    setAddress("");
                  }}
                  className="text-xs text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer"
                >
                  Clear
                </button>
              </div>
              <p className="m-0 text-gray-700 text-xs">
                {address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={placingOnMap ? handleCancelPlace : handlePlaceOnMap}
              className={`px-3 py-2.5 border-2 border-dashed rounded-lg text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-2 ${
                placingOnMap
                  ? "border-amber-400 bg-amber-50 text-amber-700 animate-pulse"
                  : "border-violet-300 bg-white text-violet-600 hover:bg-violet-50"
              }`}
            >
              {placingOnMap ? (
                <>
                  <PiHourglassBold className="animate-spin" /> Click on the map
                  to set location...
                </>
              ) : (
                <>
                  <PiMapPinLineBold size={18} /> Set Location on Map
                </>
              )}
            </button>
          )}

          <button
            type="submit"
            disabled={saving || lat === null}
            className="px-4 py-2 bg-violet-600 text-white font-semibold border-none rounded-lg cursor-pointer hover:bg-violet-700 transition text-sm disabled:opacity-40"
          >
            {saving ? "Saving..." : "Register Student"}
          </button>
        </form>
      </div>

      {/* Filter & Bulk Actions */}
      <div className="flex items-center gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded-lg border border-gray-200 text-gray-700 bg-white text-xs focus:outline-none"
        >
          <option value="all">All Students ({students.length})</option>
          <option value="unassigned">
            Unassigned ({students.filter((s) => !s.route_id).length})
          </option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({students.filter((s) => s.route_id === r.id).length})
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowBulkAssign(!showBulkAssign)}
          className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${
            showBulkAssign
              ? "bg-violet-600 text-white border-violet-600"
              : "bg-white text-gray-600 border-gray-200 hover:border-violet-400"
          }`}
        >
          Bulk
        </button>
      </div>

      {/* Bulk Assign Bar */}
      {showBulkAssign && bulkSelected.size > 0 && (
        <div className="flex items-center gap-2 bg-violet-100 p-2.5 rounded-lg border border-violet-300">
          <span className="text-xs font-bold text-violet-700">
            {bulkSelected.size} selected
          </span>
          <select
            value={bulkRouteId}
            onChange={(e) => setBulkRouteId(e.target.value)}
            className="flex-1 px-2 py-1 rounded border border-violet-300 text-xs text-gray-700 bg-white"
          >
            <option value="">Assign to route...</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleBulkAssign}
            disabled={!bulkRouteId}
            className="px-3 py-1 bg-violet-600 text-white text-xs font-bold rounded border-none cursor-pointer disabled:opacity-40"
          >
            Assign
          </button>
        </div>
      )}

      {/* Student List */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="m-0 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
          Students ({filtered.length})
        </h3>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No students found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((student) => {
              const routeName = getRouteName(student.route_id);
              return (
                <div
                  key={student.id}
                  className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-start gap-2.5">
                    {showBulkAssign && (
                      <input
                        type="checkbox"
                        checked={bulkSelected.has(student.id)}
                        onChange={() => toggleBulkSelect(student.id)}
                        className="mt-1 accent-violet-600"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="m-0 font-bold text-gray-800 text-sm truncate">
                          {student.name}
                        </p>
                        <button
                          onClick={() =>
                            handleDeleteStudent(student.id, student.name)
                          }
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition bg-transparent border-none cursor-pointer text-xs shrink-0"
                        >
                          <PiTrashBold />
                        </button>
                      </div>
                      {student.address && (
                        <p className="m-0 text-xs text-gray-400 truncate mt-0.5 flex items-center gap-1">
                          <PiMapPinFill className="text-violet-400 shrink-0" />{" "}
                          {student.address}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        {routeName ? (
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full">
                            {routeName}
                          </span>
                        ) : (
                          <select
                            value=""
                            onChange={(e) =>
                              handleAssignRoute(student.id, e.target.value)
                            }
                            className="px-2 py-0.5 rounded border border-gray-200 text-xs text-gray-500 bg-gray-50"
                          >
                            <option value="">Assign route...</option>
                            {routes.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {routeName && (
                          <button
                            onClick={() => handleAssignRoute(student.id, "")}
                            className="text-xs text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer"
                            title="Unassign from route"
                          >
                            Unassign
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
