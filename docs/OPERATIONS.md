# Micosm Game Operations

This document is for the deployment agent and server operator. Development changes should keep these checks valid even when the hosting provider changes.

## Release Gate

Run these before every release:

```powershell
npm ci
npm run lint
npm test
```

The release is blocked by any build, lint, rule-engine, rendered-HTML, or API integration failure. Deploy the exact tested Git commit, not an uncommitted workspace.

## Required Bindings

- `DB`: Cloudflare D1 database.
- `AVATARS`: avatar R2 bucket.
- `ROOM_HUB`: `GameRoomHub` Durable Object.
- `PLATFORM_HUB`: `PlatformHub` Durable Object.
- `MICO_ADMIN_PUBLIC_IDS`: comma-separated `MG-...` player IDs that may open channel management.

The application records completed schema versions in `app_schema_migrations`. `/api/health` must report database versions `1` and `2` after startup.

## Health And Alerts

- Basic probe: `GET /api/health` every minute. Alert after three consecutive non-200 responses.
- Deep probe: `GET /api/health?deep=1` from a protected internal monitor. It also verifies KataGo and Rapfi and can be slower.
- Alert on a five-minute 5xx rate above 2%, WebSocket connection failures above 5%, or AI queue-full responses above 5 per minute.
- AI services write one-line JSON records. Collect `service`, `event`, `durationMs`, `outcome`, and `detail` fields in the host log system.

## AI Services

Both engines bind to `127.0.0.1` by default. A non-loopback `KATAGO_SERVICE_HOST` or `RAPFI_SERVICE_HOST` requires the corresponding service token. The web process must receive the same token.

Use `npm run ai:supervised` to run both engines with restart and exponential backoff. Set `AI_SUPERVISOR_SERVICES=katago` or `rapfi` when the engines live on separate machines. Queue limits are controlled by `KATAGO_MAX_QUEUE` and `RAPFI_MAX_QUEUE`.

## Backup

Create a remote D1 export before schema or application releases:

```powershell
$env:MICO_D1_DATABASE="production-database-name"
./scripts/backup-d1.ps1
```

Back up R2 avatars through an `rclone` S3 remote configured for the Cloudflare account:

```powershell
./scripts/backup-r2.ps1 -Remote cloudflare-r2 -Bucket production-avatars
```

Store both backups outside the application server and retain at least seven daily and four weekly copies. A D1 backup does not include avatars. Restore scripts require an explicit `-ConfirmRestore` switch and use copy semantics so they do not delete newer destination objects:

```powershell
./scripts/restore-d1.ps1 -Database production-database-name -BackupFile ./backup.sql -ConfirmRestore
./scripts/restore-r2.ps1 -Remote cloudflare-r2 -Bucket production-avatars -BackupDirectory ./avatar-backup -ConfirmRestore
```

## Rollback

1. Stop new deployments and record the failing commit and health output.
2. Re-deploy the previous known-good commit. Do not delete Durable Object classes or bindings during rollback.
3. If data is corrupt, create a new D1 database from the last verified export, bind it as `DB`, and run the health probe before reopening traffic.
4. Keep the failed database read-only until the cause is understood.
5. Verify login, one private match, one matchmaking game, chat, and both WebSocket channels.

Schema migrations are additive and idempotent. Application rollback normally does not require database rollback.

## Incident Notes

Record timestamps, affected room IDs, request IDs from `match_events`, release commit, mitigation, and follow-up tests. Never include passwords, session cookies, phone numbers, AI tokens, or Git credentials in logs or incident notes.
