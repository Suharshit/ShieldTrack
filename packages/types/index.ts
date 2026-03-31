export interface Trip {
  id: string; 
  bus_id: string; 
  route_id: string;
  driver_id: string; 
  status: 'active' | 'completed';
  started_at: string; 
  ended_at?: string;
}
export interface BusLocation {
  trip_id: string; 
  bus_id: string; 
  tenant_id: string;
  lat: number; 
  lng: number; 
  speed_kmh: number; 
  recorded_at: string;
}
export interface SOSEvent {
  id: string; 
  trip_id: string; 
  lat: number; 
  lng: number;
  triggered_at: string; 
  resolved_at?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  device_id?: string;
}

export interface DriverSession {
  user_id: string;
  tenant_id: string;
  driver_id: string;
  role: 'driver';
  access_token: string;
  refresh_token?: string;
  expires_at: string;
}

export interface LoginResponse {
  session: DriverSession;
}

export interface TodayAssignment {
  assignment_id: string;
  trip_id?: string;
  bus_id: string;
  route_id: string;
  driver_id: string;
  start_time?: string;
  end_time?: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'cancelled';
}

export interface StartTripResponse {
  trip: Trip;
}

export interface EndTripResponse {
  trip: Trip;
}

export interface ApiErrorDetail {
  code?: string;
  message: string;
  field?: string;
}

export interface ApiErrorResponse {
  error: {
    code?: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}