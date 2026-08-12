# Production Agent Handoff

Last reviewed: 2026-08-13

## Purpose

This is the entry point for the Codex agent that will own deployment and launch.
The development agent owns application code. The deployment agent owns cloud
resources, secrets, public networking, cutover, monitoring and rollback.

Do not treat a successful homepage load as a successful launch. Micosm Game is
a stateful Worker application with D1, R2, two Durable Object namespaces and two
optional native AI services.

## Read First

Read these documents in order:

1. [`AGENT_DEPLOYMENT.md`](AGENT_DEPLOYMENT.md): exact runtime architecture,
   bindings, variables, release commands and smoke tests.
2. [`AUTH_PROVIDER_HANDOFF.md`](AUTH_PROVIDER_HANDOFF.md): how to connect an SMS
   provider to the existing managed-invitation flow after credentials arrive.
3. [`ai-deployment.md`](ai-deployment.md): KataGo and Rapfi host requirements.
4. [`LINUX_DEPLOYMENT.md`](LINUX_DEPLOYMENT.md): Linux systemd units, native
   asset layout and cross-platform backup/restore commands.
5. [`BETA_TEST_OPERATIONS.md`](BETA_TEST_OPERATIONS.md): beta switches,
   invitation management, beta season and feedback workflow.
6. [`AI_GOMOKU_PLAN.md`](AI_GOMOKU_PLAN.md): known Gomoku AI latency/strength
   findings and the required benchmark before changing an engine or model.
7. [`OPERATIONS.md`](OPERATIONS.md): current backup, health and rollback runbook.
8. [`PRODUCTION_OPERATIONS_DESIGN.md`](PRODUCTION_OPERATIONS_DESIGN.md): planned
   operator console and alerting workflow; planned items are not yet implemented.
9. [`MOBILE_QA.md`](MOBILE_QA.md): required real-device release matrix.
10. [`GAME_RECORD_FORMAT.md`](GAME_RECORD_FORMAT.md): cloud-save retention and
   the versioned local replay-file contract.

The admin-console product design and implementation boundary are in
[`ADMIN_CONSOLE_DESIGN.md`](ADMIN_CONSOLE_DESIGN.md). `/admin` now includes
persistent roles, user/session tools, report moderation, live/archive match
inspection, audited ranking corrections, announcements, versioned policies,
discussion operations, AI health, feature flags and audit history. Separate
short-lived admin sessions, account data-rights workflows and external
release/backup/incident records remain pending.

## Current Application State

- Runtime migrations are additive and currently record versions `1` through
  `11`. Version 6 adds rank-correction operations, 7 versioned policies, 8
  feature flags, 9 persistent user notifications, 10 managed rank seasons and
  11 the beta programme, managed invites and player feedback.
- Rank seasons are managed from `/admin` by `super_admin` only. Do not create
  or rename a production season with direct SQL. Read
  [`RANK_SEASON_OPERATIONS.md`](RANK_SEASON_OPERATIONS.md) before launch.
- Private rooms support per-move clocks, per-player total time and, for Go,
  main time plus configurable byo-yomi periods. Ranked clocks remain fixed by
  the server.
- Persistent notifications cover friends, invites, direct messages, community
  replies/mentions and match results. Realtime events only accelerate refresh;
  D1 remains the source of truth.
- Community feed search and `@username` / `@MG-ID` mentions are implemented.
  Moderators can pin, feature, lock, hide and restore posts with an audit reason.
- Operations feature flags are enforced server-side. They are not a deployment
  substitute and do not change already active matches.

## Required Inputs From The Owner

The deployment agent must obtain these without committing them to Git:

- Cloudflare/Sites project access and the final domain.
- Production D1 and R2 resource names.
- Production Durable Object bindings.
- The owner's `MG-...` player ID for emergency `super_admin` bootstrap.
- Separate bearer tokens for KataGo and Rapfi.
- Public HTTPS origins for the two AI nodes.
- SMS provider credentials and approved template details when SMS is enabled.
- The registration invite policy: `required`, `optional`, or `off`.
- Alert destination and the operator who may approve rollback or restore.

Never ask the owner to paste long-lived secrets into source files, issue text,
logs or a Git commit. Use the hosting platform's encrypted secret store.

## Launch Sequence

### 1. Freeze A Candidate

1. Select an exact Git commit.
2. Confirm the worktree is clean.
3. Run `npm ci`, `npm run lint`, `npm test`, `npm run test:integration` and
   `npm run test:e2e` against the candidate.
4. Record every skipped test. A skipped real-device check is not a pass.

### 2. Provision State

Provision and bind these exact names:

```text
DB            D1 database
AVATARS       R2 bucket
ROOM_HUB      GameRoomHub Durable Object
PLATFORM_HUB  PlatformHub Durable Object
```

Do not upload `.wrangler/` or local SQLite files. Let the versioned runtime
migrations create the schema, then verify `/api/health` reports every expected
schema version.

### 3. Configure Secrets And Policy

Configure AI origins/tokens, administrator IDs, secure cookies, registration
policy and the SMS adapter variables described in the linked documents. Public
traffic must use HTTPS. Ports 3210 and 3211 must not be exposed without an
authenticated reverse proxy or private network.

### 4. Prepare AI Nodes

Transfer or download the ignored KataGo and Rapfi assets. Verify the exact model
and engine versions, CPU instruction support, service token, queue limit and
health response. Do not silently fall back from the highest AI tier to the
built-in AI.

Gomoku AI uses a prewarmed Rapfi worker pool and corrected Piskvork clocks.
Run `npm run ai:gomoku:benchmark` and archive the result as described in
`AI_GOMOKU_PLAN.md`. A deployment agent must not claim the highest tier is ready
only because `/health` returns 200.

### 5. Back Up And Deploy

Before replacing a live version, export D1 and copy R2 avatars to storage outside
the application host. Keep the previous deployment available. Deploy the exact
tested commit and record its deployment identifier.

### 6. Verify Before Opening Traffic

Run the complete smoke test in `AGENT_DEPLOYMENT.md` with two accounts and two
clients. Include authentication, avatar persistence, private rooms, invite-code joining,
matchmaking, ranked settlement, spectators, direct/world chat, reconnect,
  departure adjudication, replay, both AI services, rank-season visibility and
  mobile layouts. Confirm that a closing season rejects new queue entries while
  allowing its already active matches to settle.

Repeat the matrix in `MOBILE_QA.md` on real Android and iPhone browsers,
including WeChat. Verify invitation-code entry with the on-screen keyboard and
clipboard paste; QR room joining has been removed from the product.

### 7. Cut Over Gradually

Start with owner accounts, then a small invited group, then public traffic.
Watch 5xx rate, WebSocket failures, AI latency/queue depth, registration errors
and D1 write failures during each stage. Stop expansion when a release gate is
breached.

## Required Completion Report

The deployment agent must report:

- Git commit and deployment identifier.
- Public HTTPS URL and certificate status.
- D1, R2 and Durable Object binding names.
- Applied schema versions.
- Registration mode and SMS provider state, without revealing secrets.
- KataGo and Rapfi engine/model versions and health results.
- Automated test totals and real-device matrix results.
- Backup locations, restore-drill result and rollback target.
- Monitoring/alert destination.
- Every skipped or failed launch check.

If any item is missing, report the deployment as a preview or limited beta, not
as production complete.
