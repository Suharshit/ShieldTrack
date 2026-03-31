import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DriverSession } from '@shieldtrack/types';

const SESSION_KEY = 'shieldtrack.driver.session.v1';

const isDriverSession = (value: unknown): value is DriverSession => {
  if (!value || typeof value !== 'object') return false;
  const session = value as DriverSession;
  return (
    typeof session.user_id === 'string' &&
    typeof session.tenant_id === 'string' &&
    typeof session.driver_id === 'string' &&
    session.role === 'driver' &&
    typeof session.access_token === 'string' &&
    typeof session.expires_at === 'string'
  );
};

const isExpired = (session: DriverSession): boolean => {
  const expiry = Date.parse(session.expires_at);
  if (Number.isNaN(expiry)) return false;
  return expiry <= Date.now();
};

export const saveSession = async (session: DriverSession): Promise<void> => {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const loadSession = async (): Promise<DriverSession | null> => {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isDriverSession(parsed)) return null;
    if (isExpired(parsed)) {
      await clearSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const clearSession = async (): Promise<void> => {
  await AsyncStorage.removeItem(SESSION_KEY);
};
