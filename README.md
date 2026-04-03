# ShieldTrack Monorepo

![43%](https://progress-bar.xyz/43/?title=Project%20completed)

Status: 43% weighted completion. Admin operations now include standing bus assignment (driver + default route), while mobile trip pipeline and alerting flow are still in progress.

## Prerequisites

- Node.js 20+
- pnpm 9+

## Setup

1. Copy the environment template to your local machine:

   ```sh
   cp .env.example .env
   ```

2. Open `.env` and fill in your Supabase credentials (this single root `.env` file powers the mobile app, admin portal, API, and Python ML Backend).
3. Install the workspace dependencies:

   ```sh
   pnpm setup
   ```

## Run apps

```sh
pnpm dev:admin
pnpm dev:mobile
pnpm dev:api
```

## Build

```sh
pnpm build
```

## Troubleshooting

- Make sure you are running commands from the repo root.
- If dependencies seem stale, run `pnpm install` again.
