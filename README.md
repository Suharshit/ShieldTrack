# ShieldTrack Monorepo

## Prerequisites

- Node.js 20+
- pnpm 9+

## Setup

From the repo root (the folder that contains `apps/` and `packages/`):

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
