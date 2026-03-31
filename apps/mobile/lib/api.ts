import {
  ApiErrorResponse,
  EndTripResponse,
  LoginRequest,
  LoginResponse,
  StartTripResponse,
  TodayAssignment,
  Trip,
} from '@shieldtrack/types';

type ApiSuccess<T> = { ok: true; data: T; status: number };
type ApiFailure = { ok: false; error: ApiErrorResponse; status: number };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const DEFAULT_TIMEOUT_MS = 10000;

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || 'http://localhost:4000';

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
