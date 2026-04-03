import express from "express";
import cors from "cors";
import type { Request, Response, Router } from "express";

const API_PORT = 3001;
const GEO_CACHE_TTL_MS = 5 * 60 * 1000;
const GEO_RATE_WINDOW_MS = 60 * 1000;
const GEO_RATE_LIMIT_PER_IP = 30;
const GEO_CACHE_DECIMALS = 5;
const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  "ShieldTrack/1.0 (reverse geocode proxy; contact: support@shieldtrack.local)";

interface ReverseGeocodeCacheEntry {
  displayName: string;
  expiresAt: number;
}

interface RateLimitBucket {
  requests: number[];
  lastSeen: number;
}

const reverseGeocodeCache = new Map<string, ReverseGeocodeCacheEntry>();
const reverseGeocodeRequestsByIp = new Map<string, RateLimitBucket>();

function isMissingOptionalRouterError(
  err: unknown,
  modulePath: string,
): boolean {
  if (!(err instanceof Error)) return false;

  const errorCode = (err as NodeJS.ErrnoException).code;
  if (errorCode !== "MODULE_NOT_FOUND") return false;

  return (
    err.message.includes(`'${modulePath}'`) ||
    err.message.includes(`"${modulePath}"`) ||
    err.message.includes(modulePath)
  );
}

function loadOptionalRouter(modulePath: string): Router {
  try {
    const loaded = require(modulePath);
    return (loaded.default || loaded) as Router;
  } catch (err) {
    if (!isMissingOptionalRouterError(err, modulePath)) {
      console.error(`Failed to load optional router ${modulePath}:`, err);
      throw err;
    }

    const router = express.Router();
    router.use((_req, res) => {
      res.status(501).json({ error: `${modulePath} is not configured.` });
    });
    return router;
  }
}

const authRouter = loadOptionalRouter("./routes/auth");
const fleetRouter = loadOptionalRouter("./routes/fleet");
const tripsRouter = loadOptionalRouter("./routes/trips");
const sosRouter = loadOptionalRouter("./routes/sos");

function parseCoordinate(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getRateLimitKey(req: Request): string {
  return req.ip || "unknown";
}

function isRateLimited(ipKey: string, now: number): boolean {
  const existingBucket = reverseGeocodeRequestsByIp.get(ipKey);
  const recentRequests = existingBucket?.requests ?? [];
  const windowStart = now - GEO_RATE_WINDOW_MS;
  const inWindow = recentRequests.filter((ts) => ts >= windowStart);

  const nextBucket: RateLimitBucket = {
    requests: inWindow,
    lastSeen: now,
  };

  if (inWindow.length >= GEO_RATE_LIMIT_PER_IP) {
    reverseGeocodeRequestsByIp.set(ipKey, nextBucket);
    return true;
  }

  nextBucket.requests.push(now);
  reverseGeocodeRequestsByIp.set(ipKey, nextBucket);
  return false;
}

function pruneRateLimitBuckets(now: number): void {
  const staleBefore = now - GEO_RATE_WINDOW_MS;
  for (const [ipKey, bucket] of reverseGeocodeRequestsByIp.entries()) {
    if (bucket.lastSeen < staleBefore) {
      reverseGeocodeRequestsByIp.delete(ipKey);
    }
  }
}

function toCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(GEO_CACHE_DECIMALS)},${lng.toFixed(GEO_CACHE_DECIMALS)}`;
}

function pruneExpiredCache(now: number): void {
  for (const [key, value] of reverseGeocodeCache.entries()) {
    if (value.expiresAt <= now) reverseGeocodeCache.delete(key);
  }
}

const app = express();
app.set("trust proxy", 1);

const rateLimitPruneInterval = setInterval(() => {
  pruneRateLimitBuckets(Date.now());
}, GEO_RATE_WINDOW_MS);

if (typeof rateLimitPruneInterval.unref === "function") {
  rateLimitPruneInterval.unref();
}

app.use(cors());
app.use(express.json());
app.use("/auth", authRouter);
app.use("/fleet", fleetRouter);
app.use("/trips", tripsRouter);
app.use("/sos", sosRouter);

app.get("/geocode/reverse", async (req: Request, res: Response) => {
  const lat = parseCoordinate(req.query.lat);
  const lng = parseCoordinate(req.query.lng);

  if (
    lat == null ||
    lng == null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    res.status(400).json({ error: "Invalid lat/lng coordinates." });
    return;
  }

  const now = Date.now();
  pruneExpiredCache(now);

  const clientKey = getRateLimitKey(req);
  if (isRateLimited(clientKey, now)) {
    res.status(429).json({
      error: "Too many reverse geocoding requests. Please retry shortly.",
    });
    return;
  }

  const cacheKey = toCacheKey(lat, lng);
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    res.json({ display_name: cached.displayName, source: "cache" });
    return;
  }

  const url =
    `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1` +
    `&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": NOMINATIM_USER_AGENT,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      res.status(502).json({
        error: `Reverse geocode upstream failed (${response.status}).`,
      });
      return;
    }

    const data = (await response.json()) as { display_name?: string };
    const displayName =
      typeof data.display_name === "string" &&
      data.display_name.trim().length > 0
        ? data.display_name
        : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    reverseGeocodeCache.set(cacheKey, {
      displayName,
      expiresAt: now + GEO_CACHE_TTL_MS,
    });

    res.json({ display_name: displayName, source: "nominatim" });
  } catch {
    res.status(502).json({ error: "Reverse geocoding service unavailable." });
  }
});

app.listen(API_PORT, () => console.log(`API running on :${API_PORT}`));
