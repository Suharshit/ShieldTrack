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

const reverseGeocodeCache = new Map<string, ReverseGeocodeCacheEntry>();
const reverseGeocodeRequestsByIp = new Map<string, number[]>();

function loadOptionalRouter(modulePath: string): Router {
  try {
    const loaded = require(modulePath);
    return (loaded.default || loaded) as Router;
  } catch {
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
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    const first = forwardedFor[0]?.split(",")[0]?.trim();
    if (first) return first;
  }

  return req.ip || "unknown";
}

function isRateLimited(ipKey: string, now: number): boolean {
  const recentRequests = reverseGeocodeRequestsByIp.get(ipKey) ?? [];
  const windowStart = now - GEO_RATE_WINDOW_MS;
  const inWindow = recentRequests.filter((ts) => ts >= windowStart);

  if (inWindow.length >= GEO_RATE_LIMIT_PER_IP) {
    reverseGeocodeRequestsByIp.set(ipKey, inWindow);
    return true;
  }

  inWindow.push(now);
  reverseGeocodeRequestsByIp.set(ipKey, inWindow);
  return false;
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
    res
      .status(429)
      .json({
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
    const response = await fetch(url, {
      headers: {
        "User-Agent": NOMINATIM_USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      res
        .status(502)
        .json({
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
