import {
  ApiErrorResponse,
  EndTripResponse,
  LoginRequest,
  LoginResponse,
  ParentLoginRequest,
  StartTripResponse,
  TodayAssignment,
  Trip,
} from '@shieldtrack/types';
import { supabase } from './supabase';

type ApiSuccess<T> = { ok: true; data: T; status: number };
type ApiFailure = { ok: false; error: ApiErrorResponse; status: number };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const DEFAULT_TIMEOUT_MS = 10000;

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:3001';

const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS === '1';

const API_PATHS = {
  login: '/auth/login',
  todayAssignment: '/driver/assignment/today',
  startTrip: (tripId: string) => `/driver/trips/${tripId}/start`,
  endTrip: (tripId: string) => `/driver/trips/${tripId}/end`,
};

const nowIso = () => new Date().toISOString();

const defaultError = (status: number, message: string): ApiErrorResponse => ({
  error: {
    code: status ? `HTTP_${status}` : 'NETWORK_ERROR',
    message,
  },
});

const parseError = async (res: Response): Promise<ApiErrorResponse> => {
  try {
    const json = (await res.json()) as ApiErrorResponse;
    if (json?.error?.message) return json;
  } catch {
    // Ignore JSON parse errors and fall back to default.
  }

  return defaultError(res.status, res.statusText || 'Request failed');
};

const requestJson = async <T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<ApiResult<T>> => {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const error = await parseError(res);
      return { ok: false, error, status: res.status };
    }

    const data = (await res.json()) as T;
    return { ok: true, data, status: res.status };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Network request failed';
    return { ok: false, error: defaultError(0, message), status: 0 };
  } finally {
    clearTimeout(timeout);
  }
};

const mockTrip = (tripId: string): Trip => ({
  id: tripId,
  tenant_id: 'tenant_mock_1',
  assignment_id: 'assign_mock_1',
  bus_id: 'bus_mock_1',
  route_id: 'route_mock_1',
  driver_id: 'driver_mock_1',
  status: 'active',
  started_at: nowIso(),
});

const mockLogin = async (): Promise<ApiResult<LoginResponse>> => ({
  ok: true,
  status: 200,
  data: {
    session: {
      user_id: 'user_mock_1',
      tenant_id: 'tenant_mock_1',
      driver_id: 'driver_mock_1',
      role: 'driver',
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      expires_at: nowIso(),
    },
  },
});

const mockParentLogin = async (): Promise<ApiResult<LoginResponse>> => ({
  ok: true,
  status: 200,
  data: {
    session: {
      user_id: 'user_mock_parent',
      tenant_id: 'tenant_mock_1',
      student_id: 'student_mock_1',
      bus_id: 'bus_mock_1',
      role: 'parent',
      access_token: 'mock_access_token_parent',
      refresh_token: 'mock_refresh_token_parent',
      expires_at: nowIso(),
    },
  },
});

const mockAssignment = async (): Promise<ApiResult<TodayAssignment>> => ({
  ok: true,
  status: 200,
  data: {
    assignment_id: 'assign_mock_1',
    trip_id: 'trip_mock_1',
    bus_id: 'bus_mock_1',
    route_id: 'route_mock_1',
    driver_id: 'driver_mock_1',
    start_time: nowIso(),
    status: 'assigned',
  },
});

const mockStartTrip = async (
  tripId: string
): Promise<ApiResult<StartTripResponse>> => ({
  ok: true,
  status: 200,
  data: { trip: mockTrip(tripId) },
});

const mockEndTrip = async (
  tripId: string
): Promise<ApiResult<EndTripResponse>> => ({
  ok: true,
  status: 200,
  data: {
    trip: {
      ...mockTrip(tripId),
      status: 'completed',
      ended_at: nowIso(),
    },
  },
});

export const apiClient = {
  login: async (payload: LoginRequest): Promise<ApiResult<LoginResponse>> => {
    if (USE_MOCKS) return mockLogin();

    // Supabase native Auth implementation for Drivers
    const { data: supaData, error } = await supabase.auth.signInWithPassword({
      email: payload.email,
      password: payload.password,
    });

    if (error || !supaData.user || !supaData.session) {
      return {
        ok: false,
        status: error?.status ?? 401,
        error: { error: { message: error?.message || 'Invalid credentials' } },
      };
    }

    // Map the Supabase session token backwards into our internal ShieldTrack framework.
    // IMPORTANT: Fall back to '' (not 'driver') so users without a role tag are blocked.
    const userRole = supaData.user.app_metadata?.role || supaData.user.user_metadata?.role || '';
    const tenantId = supaData.user.app_metadata?.tenant_id || supaData.user.user_metadata?.tenant_id || '';
    const driverId = supaData.user.app_metadata?.driver_id || supaData.user.user_metadata?.driver_id || supaData.user.id;
    const expiresAtIso = new Date((supaData.session.expires_at || 0) * 1000).toISOString();

    if (userRole !== 'driver') {
      await supabase.auth.signOut(); // Kick them out if not a driver
      return {
        ok: false,
        status: 403,
        error: { error: { message: 'Unauthorized: Driver access required. Ensure your account has the driver role.' } },
      };
    }

    return {
      ok: true,
      status: 200,
      data: {
        session: {
          user_id: supaData.user.id,
          tenant_id: tenantId,
          driver_id: driverId,
          role: 'driver',
          access_token: supaData.session.access_token,
          refresh_token: supaData.session.refresh_token,
          expires_at: expiresAtIso,
        },
      },
    };
  },

  parentLogin: async (payload: ParentLoginRequest): Promise<ApiResult<LoginResponse>> => {
    if (USE_MOCKS) return mockParentLogin();
    
    // Parents hit our custom NodeJS REST backend because Supabase doesn't natively support 
    // arbitrary field combination sign-in natively. Our node backend mints a custom JWT token.
    return requestJson<LoginResponse>(API_PATHS.login, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getTodayAssignment: async (): Promise<ApiResult<TodayAssignment>> => {
    if (USE_MOCKS) return mockAssignment();
    return requestJson<TodayAssignment>(API_PATHS.todayAssignment, {
      method: 'GET',
    });
  },

  startTrip: async (tripId: string): Promise<ApiResult<StartTripResponse>> => {
    if (USE_MOCKS) return mockStartTrip(tripId);
    return requestJson<StartTripResponse>(API_PATHS.startTrip(tripId), {
      method: 'POST',
    });
  },

  endTrip: async (tripId: string): Promise<ApiResult<EndTripResponse>> => {
    if (USE_MOCKS) return mockEndTrip(tripId);
    return requestJson<EndTripResponse>(API_PATHS.endTrip(tripId), {
      method: 'POST',
    });
  },
};
