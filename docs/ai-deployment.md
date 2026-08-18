# Micosm AI deployment

Micosm keeps the game server and the heavy board-game engines as separate
processes. The web application never depends on a development-machine path: it
calls the KataGo and Rapfi nodes through configurable HTTP origins.

## Processes

1. The Micosm web application handles accounts, rooms, rules, replay, and the
   built-in AI for the first three difficulty levels.
2. `npm run ai` starts a standalone KataGo HTTP node for the master Go level.
3. `npm run ai:gomoku` starts a standalone Rapfi NNUE HTTP node for the master
   Gomoku level. It supports both freestyle Gomoku and Renju forbidden moves.
4. A production Worker calls these nodes over HTTPS. Keep them private behind a
   reverse proxy when possible and set matching bearer tokens on both sides.

## AI node variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `KATAGO_EXE` | KataGo binary path on Windows or Linux | `.tools/katago/engine/katago(.exe)` |
| `KATAGO_MODEL` | Neural-network model path | `.tools/katago/kata1-b28c512.bin.gz` |
| `KATAGO_CONFIG` | GTP config path | `.tools/katago/engine/default_gtp.cfg` |
| `KATAGO_MODEL_LABEL` | Model name returned by health checks | `b28c512` |
| `KATAGO_SERVICE_HOST` | Bind address | `127.0.0.1` |
| `KATAGO_SERVICE_PORT` | HTTP port | `3210` |
| `KATAGO_SERVICE_TOKEN` | Optional bearer token | empty for local development |
| `RAPFI_EXE` | Rapfi Piskvork binary path on Windows or Linux | platform AVX2 build under `.tools/rapfi/engine` |
| `RAPFI_SERVICE_HOST` | Bind address | `127.0.0.1` |
| `RAPFI_SERVICE_PORT` | HTTP port | `3211` |
| `RAPFI_SERVICE_TOKEN` | Optional bearer token | falls back to `AI_SERVICE_TOKEN` |
| `RAPFI_WORKERS` | Prewarmed Rapfi process count | `2` |
| `RAPFI_THREADS` | Search threads per process | host-bounded, normally `4` |
| `RAPFI_MEMORY_MB` | Transposition memory per process | `256` |
| `RAPFI_MAX_QUEUE` | Maximum waiting move requests | `8` |

Paths may be absolute or relative to the project root. KataGo tuning data is
created beside the executable and should be persisted across restarts. Rapfi's
`config.toml` and `mix9svq` weight files must remain beside its executable.

## Web application variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `AI_SERVICE_ORIGIN` | KataGo node origin | `http://127.0.0.1:3210` |
| `AI_SERVICE_TOKEN` | Same token used by the AI node | empty for local development |
| `AI_KATAGO_VISITS` | Master-level search budget, 50-5000 | `1600` |
| `AI_KATAGO_SECONDS` | Maximum thinking time for one master-level move | `3` |
| `RAPFI_SERVICE_ORIGIN` | Rapfi node origin | `http://127.0.0.1:3211` |
| `RAPFI_SERVICE_TOKEN` | Same token used by the Rapfi node | falls back to `AI_SERVICE_TOKEN` |
| `AI_RAPFI_SECONDS` | Maximum thinking time for one Rapfi move, 0.5-30 | `2.5` |

For a Cloudflare deployment, both service origins must be HTTPS addresses that
the Worker can reach. For a single traditional server, the default loopback
addresses are sufficient when the web process and AI nodes run on the same host.

## Migration checklist

1. Install Node.js 22 or newer and the GPU driver/OpenCL runtime required by
   KataGo. Rapfi is CPU-based; select AVX2 or a compatible fallback binary for
   the target processor.
2. Download the KataGo binary/model/config and the Rapfi engine package on the
   target server. Large engine files remain outside Git under `.tools/` by
   design.
3. Set the AI-node variables and start both `npm run ai` and
   `npm run ai:gomoku`. KataGo's first startup may spend several minutes tuning
   the target GPU.
4. Confirm ports 3210 and 3211 both return `ready: true` from `GET /health`.
5. Run `npm run ai:gomoku:benchmark` against port 3211 and require every release
   gate to pass. Preserve the JSON output with the release evidence.
6. Set the web variables, deploy the web application, and verify `/api/ai` and
   `/api/ai?engine=rapfi`.
7. Persist the KataGo tuning directory and supervise all three processes with
   the server's process manager.

Rapfi workers are started and warmed before health reports ready. Each request
resets an assigned worker, supplies the ordered move history, uses
`timeout_turn` for the per-move budget, and uses the protocol's unlimited value
for `time_left` because Micosm AI games do not have a whole-match engine clock.
Health reports the engine/model hash, worker capacity, queue depth and p50/p95
search latency so deployments can be compared without guessing from UI delay.

Rapfi is GPLv3 software. A deployment or distributed package that includes the
binary must preserve its license and provide the corresponding source or a
valid source-code offer/link as required by GPLv3.
