# ShieldTrack — Project Context

## Overview

ShieldTrack is a school bus safety & tracking platform built as a multi-tenant monorepo (pnpm + Turborepo). It connects three roles: **Admins**, **Drivers**, and **Parents**, backed by Supabase (PostgreSQL + Auth) and a Python ML service.

---

## Monorepo Structure

```plaintext
ShieldTrack/
├── apps/
│   ├── mobile/          # React Native (Expo 54) — Driver & Parent app
│   ├── api/             # Node.js (Express + TypeScript) — Custom REST backend
│   └── shield-admin/    # React (Vite) — Admin dashboard
├── backend/             # Python (FastAPI) — ML backend (ETA prediction, route optimizer)
├── packages/
│   ├── types/           # Shared TypeScript types across all apps
│   ├── utils/           # Shared utility helpers
│   ├── eslint-config/   # Shared ESLint config
│   └── typescript-config/
└── db_schema_context.sql  # Reference Supabase schema (not runnable directly)
```

---

## Apps

### Mobile (`apps/mobile`) — Expo + React Native

- Single login screen with a **Driver / Parent toggle**
- **Driver login**: email + password → Supabase native `signInWithPassword`
- **Parent login**: `institute_code` + `registration_no` → Node.js REST API (`/auth/login`) → custom JWT (7-day expiry)
- Post-login routing: drivers → `/trip`, parents → `/tracker`
- Session stored in `AsyncStorage` (`shieldtrack.session.v1`), typed as `DriverSession | ParentSession`
- Mock mode available via `EXPO_PUBLIC_USE_MOCKS=1`
- **All env vars are read from the root `.env`** — no separate mobile `.env` in use

### API (`apps/api`) — Express + TypeScript

- Custom REST backend for operations Supabase Auth cannot handle natively
- `/auth/login` (POST): validates `institute_code` → `tenants` table, then `registration_no` → `students` table, mints a custom JWT (7-day expiry) using `SUPABASE_JWT_SECRET`
- Runs on **port 3001**; mobile reads base URL from `EXPO_PUBLIC_API_BASE_URL`
- Uses Supabase **service role client** (bypasses RLS) for admin DB queries
- Other route stubs: `/fleet`, `/sos`, `/trips` (in progress)

### Shield Admin (`apps/shield-admin`) — React + Vite

- Admin dashboard for fleet monitoring (real-time bus locations via Supabase subscriptions)
- Connects to Supabase with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
- Manages: Tenants, Buses, Routes, Students, Trips, SOS Events, Deviation Alerts

### ML Backend (`backend/`) — FastAPI + Python

- `POST /predict/eta` — ML model (scikit-learn pickle) predicts bus arrival time
- `POST /predict/route` — Graph-based route optimizer returns ranked route options
- `POST /predict/batch-eta` — Batch ETA for all buses (useful for simulation)
- Results are persisted to Supabase asynchronously (non-blocking background task)
- Optional Google Maps integration for live traffic delay; falls back to simulated congestion

---

## Database (Supabase / PostgreSQL)

Key tables (all PKs are `uuid DEFAULT gen_random_uuid()`):

- `tenants` — schools/institutes; has unique `institute_code`
- `users` — drivers + admins; Supabase Auth–managed; has `role`, `tenant_id`, `device_id`
- `students` — student records; has `registration_no` (unique per tenant, used for parent login), linked to `tenant_id` and optional `route_id`
- `buses` — fleet vehicles per tenant
- `routes` — polyline + stops per tenant
- `trip_assignments` — daily bus-driver-route assignments
- `trips` — active/completed trips with status enum (`active`, `completed`)
- `bus_locations` — real-time GPS pings per trip
- `sos_events` / `deviation_alerts` — safety event logs
- `bus_eta_predictions` / `bus_route_recommendations` — ML output storage
- View: `latest_bus_locations` — most recent ping per bus (used by admin dashboard)

---

## Key Environment Variables
>
> All apps read from the **single root `.env`** file. Do not create per-app `.env` files.

| Variable | Used By | Notes |
| -------- | ------- | ----- |
| `EXPO_PUBLIC_SUPABASE_URL` | Mobile | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Mobile | Public anon key |
| `EXPO_PUBLIC_API_BASE_URL` | Mobile | Node API base URL — use LAN IP on physical devices |
| `EXPO_PUBLIC_USE_MOCKS` | Mobile | Set to `1` to bypass backend for UI testing |
| `VITE_SUPABASE_URL` | Shield Admin | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Shield Admin | Public anon key |
| `SUPABASE_URL` | API (Node), ML (Python) | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | API (Node), ML (Python) | Service role key — never expose publicly |
| `SUPABASE_JWT_SECRET` | API (Node) | Signs parent session JWTs |
| `GOOGLE_MAPS_API_KEY` | ML Backend | Optional; defaults to `mock` |
