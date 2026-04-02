import { useState, useEffect, useCallback, FormEvent } from "react";
import {
  PiSteeringWheelBold,
  PiPlusBold,
  PiTrashBold,
  PiUserCircleBold,
} from "react-icons/pi";
import { supabase } from "../supabase";
import type { User } from "../supabase";

interface DriverPanelProps {
  tenantId: string;
}

export default function DriverPanel({ tenantId }: DriverPanelProps) {
  const [drivers, setDrivers] = useState<User[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchDrivers = useCallback(async () => {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("role", "driver")
      .order("created_at", { ascending: false });
    if (data) setDrivers(data);
  }, [tenantId]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const handleAddDriver = async (e: FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    setSaving(true);

    // Check if driver with this email already exists for this tenant
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .single();

    if (existing) {
      alert("A user with this email already exists.");
      setSaving(false);
      return;
    }

    // Insert directly into users table with role = 'driver'
    const { error } = await supabase.from("users").insert({
      tenant_id: tenantId,
      email,
      role: "driver",
    });

    if (error) {
      alert("Error registering driver: " + error.message);
    } else {
      setNewEmail("");
      fetchDrivers();
    }
    setSaving(false);
  };

  const handleDeleteDriver = async (driverId: string, email: string | null) => {
    if (!confirm(`Remove driver ${email || "Unknown"}?`)) return;
    const { error } = await supabase.from("users").delete().eq("id", driverId);
    if (error) alert("Error removing driver: " + error.message);
    else fetchDrivers();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Registration Form */}
      <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
        <h3 className="m-0 mb-3 text-sm font-bold text-[#1a237e] flex items-center gap-1.5">
          <PiSteeringWheelBold size={18} className="text-emerald-600" />
          <span>Register Driver</span>
        </h3>
        <form onSubmit={handleAddDriver} className="flex gap-2">
          <input
            type="email"
            placeholder="Driver email address"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-gray-800 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 min-w-0"
          />
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 text-white font-semibold border-none rounded-lg cursor-pointer hover:bg-emerald-700 transition text-sm disabled:opacity-50 shrink-0 flex items-center justify-center gap-2"
          >
            {saving ? "..." : <><PiPlusBold size={16} /> Add</>}
          </button>
        </form>
      </div>

      {/* Driver List */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="m-0 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
          Drivers ({drivers.length})
        </h3>
        {drivers.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No drivers registered yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {drivers.map((driver) => (
              <div
                key={driver.id}
                className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <PiUserCircleBold size={20} />
                  </div>
                  <div>
                    <p className="m-0 font-bold text-gray-800 text-sm">
                      {driver.email || "No email"}
                    </p>
                    <p className="m-0 text-xs text-gray-400">
                      ID: {driver.id.slice(0, 8)}…
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteDriver(driver.id, driver.email)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition bg-transparent border-none cursor-pointer text-xs"
                  title="Remove driver"
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
