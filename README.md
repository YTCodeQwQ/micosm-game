# Micosm Game

Micosm Game is a mobile-first anime-inspired board game platform for Go,
Gomoku and Reversi. It combines private rooms, matchmaking, ranked play,
friends, chat, replayable match history and portable human-versus-AI play.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

Local development uses the repository's Vinext and Cloudflare configuration;
production deployment is described in the agent handoff documents below.

## Current Features

- Standard Go, Gomoku/Renju and Reversi rules
- Private rooms, six-character invite codes and random matchmaking
- Separate ranked ladders for Go and Gomoku
- Real-time room updates through WebSockets and a Durable Object hub
- Password accounts with unique names and stable public `MG-` player IDs
- Profiles, friends, direct chat, world chat and game invitations
- Consent-based undo, resignation, rematch and disconnect adjudication
- Persistent match archives with replay timelines and tactical annotations
- Four AI levels, with optional KataGo and Rapfi services for master play
- Responsive desktop and mobile interfaces

The SMS verification field is intentionally a development placeholder and is
not connected to a production provider yet.

## Architecture

- `app/`: React UI and HTTP API routes
- `lib/match-engine.ts`: authoritative game rules
- `worker/`: Cloudflare Worker and Durable Object WebSocket routing
- `db/`: D1, R2 and Durable Object bindings
- `scripts/`: optional KataGo and Rapfi service wrappers
- `docs/AGENT_DEPLOYMENT.md`: deployment handoff and smoke tests
- `docs/LINUX_DEPLOYMENT.md`: Linux AI-node, systemd and portable operations guide
- `docs/PRODUCTION_AGENT_HANDOFF.md`: launch-agent ownership and cutover checklist
- `docs/AUTH_PROVIDER_HANDOFF.md`: SMS and invitation replacement contract
- `docs/AI_GOMOKU_PLAN.md`: Gomoku AI diagnosis and benchmark plan
- `docs/ADMIN_CONSOLE_DESIGN.md`: administrator roles and workspace boundaries
- `docs/PRODUCTION_OPERATIONS_DESIGN.md`: planned production operations console

## Useful Commands

- `npm run dev`: start local development
- `npm run ai`: start the optional KataGo GPU node for master-level Go
- `npm run ai:gomoku`: start the Rapfi NNUE node for master-level Gomoku
- `npm run build`: verify the vinext build output
- `npm test`: build the app and run rules, clock, AI and source-contract tests
- `npm run db:generate`: generate Drizzle migrations after schema changes
- `npm run verify:linux`: verify cross-platform paths and Linux deployment assets
- `npm run ops:backup`: export the configured remote D1 database on Windows or Linux

Production and server-migration settings for the AI node are documented in
[`docs/ai-deployment.md`](docs/ai-deployment.md).

Agents deploying the complete application must follow
[`docs/AGENT_DEPLOYMENT.md`](docs/AGENT_DEPLOYMENT.md).

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
