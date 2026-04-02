import { useState, useEffect, useCallback, FormEvent } from "react";
import { PiBusBold, PiPlusBold, PiTrashBold } from "react-icons/pi";
import { supabase } from "../supabase";
import type { Bus } from "../supabase";

interface FleetPanelProps {
  tenantId: string;
}

const DEFAULT_CAPACITY = 40;
const MIN_CAPACITY = 10;
const MAX_CAPACITY = 100;

export default function FleetPanel({ tenantId }: FleetPanelProps) {
  const [fleetList, setFleetList] = useState<Bus[]>([]);
  const [newPlateNumber, setNewPlateNumber] = useState("");
  const [newBusCapacity, setNewBusCapacity] = useState("40");
  const [saving, setSaving] = useState(false);

  const fetchFleet = useCallback(async () => {
    const { data } = await supabase
      .from("buses")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (data) setFleetList(data);
  }, [tenantId]);

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  const handleRegisterBus = async (e: FormEvent) => {
    e.preventDefault();
    if (!newPlateNumber.trim()) return;

    const plate = newPlateNumber.trim().toUpperCase();

    let capacity = parseInt(newBusCapacity, 10);
    if (isNaN(capacity)) capacity = DEFAULT_CAPACITY;
    capacity = Math.max(MIN_CAPACITY, Math.min(MAX_CAPACITY, capacity));

    setSaving(true);
    const { error } = await supabase
      .from("buses")
      .insert({ plate_number: plate, tenant_id: tenantId, capacity });

    if (error) alert("Error: This Plate Number might already exist!");
    else {
      setNewPlateNumber("");
      setNewBusCapacity("40");
      fetchFleet();
    }
    setSaving(false);
  };

  const handleDeleteBus = async (busId: string, plate: string) => {
    if (!confirm(`Delete bus ${plate}? This cannot be undone.`)) return;
    const { error } = await supabase.from("buses").delete().eq("id", busId);
    if (error) alert("Error deleting bus: " + error.message);
    else fetchFleet();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Registration Form */}
      <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
        <h3 className="m-0 mb-3 text-sm font-bold text-[#1a237e] flex items-center gap-1.5">
          <PiBusBold size={18} className="text-indigo-600" />
          <span>Register New Vehicle</span>
        </h3>
        <form onSubmit={handleRegisterBus} className="flex gap-2">
          <input
            type="text"
            placeholder="Plate Number"
            value={newPlateNumber}
            onChange={(e) => setNewPlateNumber(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-800 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-0"
          />
          <input
            type="number"
            placeholder="Seats"
            value={newBusCapacity}
            onChange={(e) => setNewBusCapacity(e.target.value)}
            className="w-16 px-2 py-2 rounded-lg border border-gray-300 text-gray-800 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            min={MIN_CAPACITY}
            max={MAX_CAPACITY}
          />
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold border-none rounded-lg cursor-pointer hover:bg-indigo-700 transition text-sm disabled:opacity-50 shrink-0 flex items-center justify-center gap-2"
          >
            {saving ? "..." : <><PiPlusBold size={16} /> Add</>}
          </button>
        </form>
      </div>

      {/* Fleet List */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="m-0 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
          Fleet ({fleetList.length} vehicles)
        </h3>
        {fleetList.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No vehicles registered yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {fleetList.map((bus) => (
              <div
                key={bus.id}
                className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <PiBusBold size={20} />
                  </div>
                  <div>
                    <p className="m-0 font-bold text-gray-800 text-sm">
                      {bus.plate_number}
                    </p>
                    <p className="m-0 text-xs text-gray-400">
                      {bus.capacity} seats
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteBus(bus.id, bus.plate_number)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition bg-transparent border-none cursor-pointer text-xs"
                  title="Delete bus"
                >
                  <PiTrashBold />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
