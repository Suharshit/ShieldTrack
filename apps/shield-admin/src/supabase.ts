import { createClient } from "@supabase/supabase-js";

// --- 🔑 SUPABASE CONFIGURATION ---
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables. " +
    "Please check your .env file."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- 📄 TYPESCRIPT INTERFACES FROM SCHEMA ---

export interface Tenant {
  id: string; // uuid
  name: string;
  institute_code: string;
  created_at: string;
}

export interface Bus {
  id: string; // uuid
  tenant_id: string; // uuid
  plate_number: string; // unique per tenant (case-insensitive)
  capacity: number;
  created_at: string;
}

export interface Route {
  id: string; // uuid
  tenant_id: string; // uuid
  name: string;
  polyline: any; // jsonb
  stops: any; // jsonb
  created_at: string;
}

export interface Student {
  id: string; // uuid
  tenant_id: string; // uuid
  name: string;
  route_id: string | null; // uuid
  created_at: string;
}

export interface BusLocation {
  id: string; // uuid
  trip_id: string; // uuid
  bus_id: string; // uuid
  tenant_id: string; // uuid
  lat: number;
  lng: number;
  speed_kmh: number;
  recorded_at: string;
}

export interface Trip {
  id: string; // uuid
  tenant_id: string; // uuid
  assignment_id: string; // uuid
  bus_id: string; // uuid
  route_id: string; // uuid
  driver_id: string; // uuid
  status: string;
  started_at: string;
  ended_at: string | null;
}

export interface TripAssignment {
  id: string; // uuid
  tenant_id: string; // uuid
  bus_id: string; // uuid
  route_id: string; // uuid
  driver_id: string; // uuid
  assigned_date: string;
  created_at: string;
}

export interface User {
  id: string; // uuid
  tenant_id: string; // uuid
  email: string | null;
  role: string;
  device_id: string | null;
  student_id: string | null; // uuid
  created_at: string;
}

export interface BusEtaPrediction {
  id: string; // uuid
  bus_id: string; // uuid
  eta_minutes: number;
  confidence_pct: number;
  predicted_at: string;
  features_json: any; // jsonb
}

export interface BusRouteRecommendation {
  id: string; // uuid
  bus_id: string; // uuid
  recommended_at: string;
  routes_json: any; // jsonb
}

export interface DeviationAlert {
  id: string; // uuid
  trip_id: string; // uuid
  bus_id: string; // uuid
  tenant_id: string; // uuid
  lat: number;
  lng: number;
  distance_m: number;
  triggered_at: string;
}

export interface SosEvent {
  id: string; // uuid
  trip_id: string; // uuid
  bus_id: string; // uuid
  tenant_id: string; // uuid
  lat: number;
  lng: number;
  triggered_at: string;
  resolved_at: string | null;
  notes: string | null;
}
