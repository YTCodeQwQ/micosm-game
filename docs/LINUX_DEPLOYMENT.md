# Micosm Game Linux deployment

Last verified: 2026-08-13

This guide covers the Linux parts of Micosm Game. The recommended production
topology keeps the web application on the configured Cloudflare Worker/Sites
runtime and runs only KataGo and Rapfi on Linux compute nodes. Do not replace
the Worker with a plain static server: D1, R2, API routes and both Durable
Object WebSocket hubs are required.

## Supported baseline

- Ubuntu 24.04 LTS or Debian 12, `x86_64`.
- Node.js `>=22.13.0`; use the same major version for build and AI services.
- Rapfi CPU with AVX2, or set `RAPFI_EXE` to a compatible non-AVX2 build.
- KataGo OpenCL/CUDA runtime compatible with the selected KataGo binary.
- `rclone` only when R2 backup/restore runs on this host.

The web build and test suite already run on Ubuntu in
`.github/workflows/quality.yml`. The native engine files are intentionally
ignored by Git and must be transferred or downloaded separately.

## Prepare the host

```bash
sudo useradd --system --home /opt/micosm --shell /usr/sbin/nologin micosm
sudo mkdir -p /opt/micosm/current /etc/micosm
sudo chown -R micosm:micosm /opt/micosm
```

Check out the tested commit into `/opt/micosm/current`, then install exactly the
lockfile dependencies and run the portable verification:

```bash
cd /opt/micosm/current
npm ci
npm run lint
npm test
npm run verify:linux
```

## Install native AI assets

Use this layout:

```text
.tools/katago/engine/katago
.tools/katago/engine/default_gtp.cfg
.tools/katago/kata1-b28c512.bin.gz
.tools/rapfi/engine/pbrain-rapfi-linux-clang-avx2
.tools/rapfi/engine/config.toml
.tools/rapfi/engine/mix9svqfreestyle_bsmix.bin.lz4
.tools/rapfi/engine/mix9svqstandard_bs15.bin.lz4
.tools/rapfi/engine/mix9svqrenju_bs15_black.bin.lz4
.tools/rapfi/engine/mix9svqrenju_bs15_white.bin.lz4
```

```bash
chmod 0755 .tools/katago/engine/katago
chmod 0755 .tools/rapfi/engine/pbrain-rapfi-linux-clang-avx2
sudo chown -R micosm:micosm .tools
```

The wrappers also accept absolute paths through `KATAGO_EXE`, `KATAGO_MODEL`,
`KATAGO_CONFIG` and `RAPFI_EXE`. This allows a deployment Agent to keep large
models in a versioned shared directory without changing application code.

## Configure and supervise the AI services

Copy `deploy/linux/ai.env.template` to `/etc/micosm/ai.env`, replace the two
tokens with different long random values, and protect the file:

```bash
sudo install -m 0600 -o root -g root deploy/linux/ai.env.template /etc/micosm/ai.env
sudo editor /etc/micosm/ai.env
sudo install -m 0644 deploy/linux/micosm-katago.service /etc/systemd/system/micosm-katago.service
sudo install -m 0644 deploy/linux/micosm-rapfi.service /etc/systemd/system/micosm-rapfi.service
sudo systemctl daemon-reload
sudo systemctl enable --now micosm-katago micosm-rapfi
```

The sample units assume `/usr/bin/node` and `/opt/micosm/current`. Adjust those
two paths when the host uses another Node installation or release layout.

```bash
systemctl status micosm-katago micosm-rapfi
journalctl -u micosm-katago -u micosm-rapfi -f
sudo bash -c 'set -a; source /etc/micosm/ai.env; curl -H "Authorization: Bearer $KATAGO_SERVICE_TOKEN" http://127.0.0.1:3210/health'
sudo bash -c 'set -a; source /etc/micosm/ai.env; curl -H "Authorization: Bearer $RAPFI_SERVICE_TOKEN" http://127.0.0.1:3211/health'
```

Both health responses must report `ready: true`. KataGo's first start can take
several minutes while it tunes the target GPU. Persist its engine directory so
that tuning data survives service restarts.

## Connect the Worker

Keep ports 3210 and 3211 closed to the public internet. Either place the AI
nodes on a private network reachable by the Worker, or terminate HTTPS at a
reverse proxy and preserve the `Authorization` header. A sample is provided in
`deploy/linux/nginx-ai.example.conf`.

Configure the Worker with:

```text
AI_SERVICE_ORIGIN=https://katago-ai.example.com
AI_SERVICE_TOKEN=<same token as KATAGO_SERVICE_TOKEN>
RAPFI_SERVICE_ORIGIN=https://rapfi-ai.example.com
RAPFI_SERVICE_TOKEN=<same token as RAPFI_SERVICE_TOKEN>
```

Do not place tokens in `.env.example`, browser variables, Git, logs or URLs.

## Portable backup and restore

The repository's operations commands use Node and work on Linux and Windows:

```bash
MICO_D1_DATABASE=production-database-name npm run ops:backup
npm run ops:backup:r2 -- --remote cloudflare-r2 --bucket production-avatars
```

Restore requires an explicit confirmation flag:

```bash
npm run ops:restore -- --database production-database-name --file ./backup.sql --confirm-restore
npm run ops:restore:r2 -- --remote cloudflare-r2 --bucket production-avatars --directory ./avatar-backup --confirm-restore
```

Perform restore drills against disposable resources. Never restore over the
only production copy without an additional verified backup.

## Release verification

1. `/api/health` is HTTP 200 and lists schema versions 1 through 11.
2. D1, R2, `ROOM_HUB` and `PLATFORM_HUB` bindings are present.
3. Both AI `/health` endpoints return `ready: true` through the final HTTPS
   origins with authentication.
4. `npm run ai:gomoku:benchmark` passes and its JSON result is archived.
5. Two clients complete invite-code room joining, reconnect, departure,
   rematch, replay and ranked settlement tests.
6. D1 and R2 backups exist outside the AI host and rollback is documented.

The authoritative full launch sequence remains in
`PRODUCTION_AGENT_HANDOFF.md`; this file is the Linux-specific implementation
guide, not a replacement for the Cloudflare deployment runbook.
