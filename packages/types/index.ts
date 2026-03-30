export interface Trip {
  id: string; bus_id: string; route_id: string;
  driver_id: string; status: 'active' | 'completed';
  started_at: string; ended_at?: string;
}
export interface BusLocation {
  trip_id: string; bus_id: string; tenant_id: string;
  lat: number; lng: number; speed_kmh: number; recorded_at: string;
}
export interface SOSEvent {
  id: string; trip_id: string; lat: number; lng: number;
  triggered_at: string; resolved_at?: string;
}