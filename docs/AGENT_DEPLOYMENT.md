# Micosm Game deployment handoff for agents

Last verified: 2026-08-02

This document is the deployment source of truth for another coding or operations
agent. Read the entire document before changing runtime configuration. The
project is a stateful Cloudflare application with two optional native AI engine
services; it is not a static React site.

## 1. Non-negotiable facts

1. Use Node.js `>=22.13.0`.
2. The web runtime requires three Cloudflare bindings:
   - D1 database: `DB`
   - R2 bucket: `AVATARS`
   - Durable Object namespace: `ROOM_HUB`, class `GameRoomHub`
3. The local `.wrangler/` directory contains development state only. Never
   commit it or treat it as a production backup.
4. KataGo and Rapfi binaries/models live under ignored `.tools/`. Git checkout
   alone does not include either strong AI engine.
5. A public URL must use HTTPS. Mobile camera scanning also requires a secure
   context; plain HTTP is suitable only for localhost or basic LAN testing.
6. Do not expose ports 3210 or 3211 directly to the public internet. Put them
   behind an authenticated HTTPS reverse proxy or private network.
7. Registration still uses the temporary invite code `abcd123`. SMS verification
   is not implemented and must be replaced before a public production launch.

## 2. Runtime architecture

```text
Browser / WeChat
       |
       | HTTPS + WebSocket
       v
vinext Cloudflare Worker
  |        |          |
  |        |          +--> ROOM_HUB Durable Object (room events)
  |        +-------------> AVATARS R2 (uploaded avatars)
  +----------------------> DB D1 (users, rooms, chat, friends, ranks)
       |
       | server-side HTTPS requests with bearer tokens
       +--> KataGo HTTP service :3210 (Go master difficulty)
       +--> Rapfi HTTP service  :3211 (Gomoku master difficulty)
```

The first three AI difficulties run inside the web process. Only the `master`
tiers need native services.

## 3. Important repository paths

| Path | Responsibility |
| --- | --- |
| `app/` | UI and HTTP API routes |
| `app/api/match/route.ts` | rooms, matchmaking, ranked play and AI orchestration |
| `app/api/history/route.ts` | authenticated match archive listing and replay loading |
| `lib/match-engine.ts` | authoritative board rules and replayable state |
| `lib/match-history.ts` | idempotent terminal-state archival in `match_records` |
| `worker/index.ts` | Worker entry point and WebSocket routing |
| `worker/game-room-hub.ts` | Durable Object WebSocket hub |
| `db/index.ts` | D1, R2 and Durable Object binding access |
| `.openai/hosting.json` | Sites project plus D1/R2 binding names |
| `vite.config.ts` | vinext, local Miniflare bindings and Durable Object migration |
| `scripts/katago-service.mjs` | KataGo HTTP wrapper |
| `scripts/rapfi-service.mjs` | Rapfi HTTP wrapper |
| `docs/ai-deployment.md` | detailed AI variable reference |

## 4. Local development

### Install and verify

```powershell
npm.cmd install
npm.cmd test
npm.cmd run lint
```

The lint command currently reports one pre-existing warning in
`lib/vendor/renjukit-board.js`; it should have zero errors.

### Start the three processes

Open a separate terminal for each long-running process:

```powershell
# Terminal 1: web application, D1/R2 emulation and Durable Object
npm.cmd run dev
```

```powershell
# Terminal 2: KataGo, optional unless testing Go master difficulty
npm.cmd run ai
```

```powershell
# Terminal 3: Rapfi, optional unless testing Gomoku master difficulty
npm.cmd run ai:gomoku
```

Expected listeners:

| Port | Service |
| --- | --- |
| `3000` | Micosm web application |
| `3210` | KataGo HTTP service |
| `3211` | Rapfi HTTP service |

Local URL: `http://127.0.0.1:3000/`.

### LAN testing

`npm run dev` already binds to `0.0.0.0`. Find the active IPv4 address and open
`http://<LAN-IP>:3000/` from a phone on the same network.

Set the public LAN origin before starting Vite so generated room QR codes do not
contain `localhost`:

```powershell
$env:VITE_LAN_ORIGIN="http://192.168.x.x:3000"
npm.cmd run dev
```

Do not hard-code the current development machine address; DHCP can change it.
Camera APIs may be unavailable over LAN HTTP. Room-code entry and photo-based QR
recognition remain valid fallbacks.

## 5. Native AI assets

The following files are intentionally ignored by Git and must be transferred or
downloaded separately.

```text
.tools/
  katago/
    engine/katago.exe                 # or Linux katago binary
    engine/default_gtp.cfg
    kata1-b28c512.bin.gz
  rapfi/
    engine/
      pbrain-rapfi-windows-avx2.exe   # current Windows development build
      pbrain-rapfi-linux-clang-avx2   # typical Linux server build
      config.toml
      mix9svqfreestyle_bsmix.bin.lz4
      mix9svqstandard_bs15.bin.lz4
      mix9svqrenju_bs15_black.bin.lz4
      mix9svqrenju_bs15_white.bin.lz4
```

KataGo requires a compatible GPU/OpenCL runtime for the current configuration.
Rapfi is CPU-based. Select an AVX2 binary only when the target CPU supports it;
otherwise use an SSE-compatible release build. On Linux, make native binaries
executable with `chmod +x`.

Rapfi is GPLv3 software. If its binary is distributed with the product, preserve
the license and satisfy the corresponding-source requirements. Official source:
<https://github.com/dhbloo/rapfi>.

## 6. Environment variables

Environment files are ignored by Git. Store production values in the hosting
platform's encrypted secret/variable system.

### Web process / Worker

| Variable | Required | Meaning | Default |
| --- | --- | --- | --- |
| `AI_SERVICE_ORIGIN` | for Go master | Reachable KataGo HTTPS origin | `http://127.0.0.1:3210` |
| `AI_SERVICE_TOKEN` | production | KataGo bearer token | empty |
| `AI_KATAGO_VISITS` | optional | Search visits, 50-5000 | `3200` |
| `AI_KATAGO_SECONDS` | optional | Maximum seconds per Go move | `12` |
| `RAPFI_SERVICE_ORIGIN` | for Gomoku master | Reachable Rapfi HTTPS origin | `http://127.0.0.1:3211` |
| `RAPFI_SERVICE_TOKEN` | production | Rapfi bearer token | falls back to `AI_SERVICE_TOKEN` |
| `AI_RAPFI_SECONDS` | optional | Maximum seconds per Gomoku move, 1-30 | `5` |
| `VITE_LAN_ORIGIN` | local/LAN only | Build-time room QR origin override | current page origin |

### KataGo service

| Variable | Meaning | Default |
| --- | --- | --- |
| `KATAGO_EXE` | native executable path | platform path under `.tools/katago` |
| `KATAGO_MODEL` | neural model path | `.tools/katago/kata1-b28c512.bin.gz` |
| `KATAGO_CONFIG` | GTP config path | `.tools/katago/engine/default_gtp.cfg` |
| `KATAGO_MODEL_LABEL` | health-check label | `b28c512` |
| `KATAGO_SERVICE_HOST` | bind address | `0.0.0.0` |
| `KATAGO_SERVICE_PORT` | bind port | `3210` |
| `KATAGO_SERVICE_TOKEN` | accepted bearer token | empty |

### Rapfi service

| Variable | Meaning | Default |
| --- | --- | --- |
| `RAPFI_EXE` | native executable path | platform AVX2 path under `.tools/rapfi` |
| `RAPFI_SERVICE_HOST` | bind address | `0.0.0.0` |
| `RAPFI_SERVICE_PORT` | bind port | `3211` |
| `RAPFI_SERVICE_TOKEN` | accepted bearer token | falls back to `AI_SERVICE_TOKEN` |

Use the same token on each service and its matching Worker variable. Prefer
different tokens for KataGo and Rapfi in production.

## 7. Recommended production topology

The safest supported topology is:

1. Deploy the web build to the configured OpenAI Sites/Cloudflare Worker target.
2. Provision the `DB`, `AVATARS` and `ROOM_HUB` bindings there.
3. Run KataGo and Rapfi on one or more dedicated compute servers.
4. Bind native services to loopback on the compute server.
5. Publish each service through HTTPS reverse proxy endpoints protected by
   bearer tokens and an IP allowlist when possible.
6. Set the Worker origins to those public/private HTTPS endpoints.

Example logical endpoints:

```text
https://katago-ai.example.com -> 127.0.0.1:3210
https://rapfi-ai.example.com  -> 127.0.0.1:3211
```

A Cloudflare Worker cannot reach `127.0.0.1` on the AI server. Loopback defaults
work only when the web runtime and AI node truly share a host/network namespace.

Because `.openai/hosting.json` exists, use the repository's Sites deployment
integration. Do not switch the project to Vercel or a plain static host: API
routes, D1, R2 and Durable Objects would be missing.

## 8. Cloudflare resource provisioning

The binding names must remain exact:

```text
DB        -> D1 database
AVATARS   -> R2 bucket
ROOM_HUB  -> Durable Object namespace using class GameRoomHub
```

`worker/index.ts` exports `GameRoomHub`, and `vite.config.ts` declares migration
tag `v1` with `new_sqlite_classes: ["GameRoomHub"]`. Preserve that migration
history when adding future Durable Object classes.

Most application tables are currently created lazily by `ensure*Schema`
functions on the first relevant API request. `db/schema.ts` is not the complete
production schema, so `npm run db:generate` alone does not provision the whole
application. After creating a fresh D1 database, perform the smoke tests below
to initialize and verify every feature area.

Authentication schema initialization also backfills a stable `MG-XXXXXXXXXX`
public ID for existing users and creates a unique index on `users.public_id`.
Finished matches are archived in `match_records`, uniquely keyed by room ID and
room version so repeated notifications cannot duplicate a result.

Before replacing an existing deployment, export or snapshot D1 and preserve R2
objects. Never copy the live `.sqlite-wal` files from a running local process as
a production migration strategy.

## 9. Build and release sequence

1. Confirm the worktree contains the intended changes only. Do not delete user
   changes in a dirty worktree.
2. Install the lockfile exactly with `npm ci` on CI/server.
3. Run `npm test` and `npm run lint`.
4. Run `npm run build`; the output is under `dist/`.
5. Provision or select the three Cloudflare bindings.
6. Configure Worker variables and secrets.
7. Start both AI services and verify their private health endpoints.
8. Deploy the web build through Sites.
9. Run API, WebSocket, desktop and mobile smoke tests.
10. Keep the previous web deployment and D1 backup available for rollback.

## 10. Health checks

### Local AI services

```powershell
Invoke-RestMethod http://127.0.0.1:3210/health
Invoke-RestMethod http://127.0.0.1:3211/health
```

Both responses must contain `ready: true`.

### Through the web application

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/ai
Invoke-RestMethod 'http://127.0.0.1:3000/api/ai?engine=rapfi'
```

Production health requests should use the final HTTPS site origin. Do not expose
service tokens in browser-side code or query strings.

## 11. Required smoke tests

Use two separate browsers or a browser plus a phone.

1. Register two users and verify duplicate usernames are rejected. Confirm both
   users receive different stable `MG-` public IDs and can be searched by ID.
2. Log out and log back in; refresh and verify the session survives.
3. Upload avatars and verify both clients can load them from R2.
4. Create a private room, join by invitation code and join by QR code.
5. Confirm room WebSocket updates arrive without manual refresh.
6. Play Gomoku and verify win, forbidden move, undo consent, formal resignation
   and rematch.
7. Play Go and verify capture, ko/superko, pass, scoring and confirmation.
8. Close one mobile browser during a match and verify the opponent receives the
   departure win after the configured grace period.
9. Complete normal matchmaking and verify both clients return to the lobby.
10. Complete ranked Go and ranked Gomoku; verify separate rating settlement.
11. Send friend, direct-chat and world-chat messages plus a room invitation.
12. Start Go master and confirm `KataGo` appears as the room AI engine.
13. Start Gomoku master in freestyle and Renju modes and confirm `Rapfi` appears.
14. Open the match archive from the account menu, load a finished match and
    move through its replay timeline. Verify resignation/departure/timeout
    reasons and both players' results are correct.
15. Verify desktop and mobile layouts at narrow and wide viewports.

## 12. Public tunnel and QR guidance

For temporary remote testing, tunnel only web port 3000. The public address must
be HTTPS, for example `https://example.ngrok-free.dev`, not HTTP.

Sakura Frp/Natfrp nodes may return `501 Not Implemented #85` when a visitor uses
HTTP. Enable the provider's automatic HTTPS option and distribute only the
`https://` URL. This error is generated by the tunnel provider before the
request reaches Micosm.

Vite currently allows `.ngrok-free.dev` hosts. When using another tunnel domain,
add its exact trusted suffix to `server.allowedHosts` in `vite.config.ts`; do not
use an unrestricted `allowedHosts: true` in a public environment.

Room QR codes use the current browser origin. Therefore open the site through
the final HTTPS tunnel URL before creating the room. A QR generated while using
`localhost` will point the phone back to itself unless `VITE_LAN_ORIGIN` is set.

## 13. Troubleshooting

### `501 Not Implemented #85`

Cause: HTTP access to a Sakura Frp/Natfrp tunnel is blocked. Use HTTPS and enable
automatic HTTPS in the tunnel configuration. No application restart is required
unless the public origin changes QR generation.

### `403` or Vite invalid-host response

Cause: tunnel hostname is absent from `server.allowedHosts`. Add only the exact
domain suffix, restart the dev server and retry over HTTPS.

### `503` when starting master AI

Check the matching `/health` endpoint, binary/model paths, bearer tokens and the
Worker service origin. Cloud deployments cannot use a development machine's
loopback URL.

### AI keeps thinking

KataGo uses a bounded per-move timeout and Rapfi defaults to five seconds. Check
the native-service terminal first. Restart only the failing AI service; the room
state remains in D1. Do not replace a strong tier with the built-in AI silently.

### `Cloudflare D1 binding DB is unavailable`

The web runtime was started without Cloudflare bindings. Use `npm run dev` for
local Miniflare or deploy through the configured Sites/Worker path. A generic
Node static server is insufficient.

### WebSocket does not update

Verify the proxy supports `Upgrade: websocket`, the `ROOM_HUB` binding exists,
and `/api/realtime?roomId=<CODE>` reaches `worker/index.ts`. Authentication
cookies must be forwarded during the upgrade.

### Camera scan is unavailable or spins forever

Use HTTPS, grant camera permission and test in a full browser rather than an
embedded browser with restricted camera APIs. Keep invitation-code entry and
photo upload available as fallbacks.

## 14. Security and launch blockers

Before calling a deployment public production:

1. Replace `TEMPORARY_INVITE_CODE = "abcd123"` with real SMS verification or a
   secure server-side invitation system.
2. Set bearer tokens for both native AI services.
3. Require HTTPS and keep secure session cookies enabled.
4. Add rate limiting for authentication, world chat, matchmaking and AI moves.
5. Add operational moderation tools for world chat reports.
6. Define D1/R2 backup retention and restore drills.
7. Add service supervision, structured logs and uptime alerts.
8. Review Rapfi GPLv3 distribution compliance.

## 15. Agent completion report

An agent that performs a deployment must report:

- web deployment URL and deployment identifier;
- D1, R2 and Durable Object binding names;
- whether both AI health checks are ready;
- exact test commands run and their pass/fail totals;
- desktop/mobile smoke-test coverage;
- any skipped migration, backup, security or AI step;
- rollback target and where the pre-deploy backup is stored.

Do not report completion merely because the web homepage loads. Authentication,
state persistence, WebSocket rooms and both strong AI tiers are required parts
of the deployed application.
