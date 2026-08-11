# Production Agent Handoff

Last reviewed: 2026-08-11

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
2. [`AUTH_PROVIDER_HANDOFF.md`](AUTH_PROVIDER_HANDOFF.md): how to replace the
   temporary registration invite with an SMS provider after credentials arrive.
3. [`ai-deployment.md`](ai-deployment.md): KataGo and Rapfi host requirements.
4. [`AI_GOMOKU_PLAN.md`](AI_GOMOKU_PLAN.md): known Gomoku AI latency/strength
   findings and the required benchmark before changing an engine or model.
5. [`OPERATIONS.md`](OPERATIONS.md): current backup, health and rollback runbook.
6. [`PRODUCTION_OPERATIONS_DESIGN.md`](PRODUCTION_OPERATIONS_DESIGN.md): planned
   operator console and alerting workflow; planned items are not yet implemented.
7. [`MOBILE_QA.md`](MOBILE_QA.md): required real-device release matrix.

The admin-console product design and implementation boundary are in
[`ADMIN_CONSOLE_DESIGN.md`](ADMIN_CONSOLE_DESIGN.md). `/admin` Phase 1 is
implemented: persistent roles, overview, user/session tools, report moderation,
AI health and audit history. Match/ranking operations, announcements and the
operations dashboard are still planned.

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
3. Run `npm ci`, `npm run lint`, `npm test`, `npm run test:e2e` and the API
   integration suite against the candidate.
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
clients. Include authentication, avatar persistence, private rooms, QR joining,
matchmaking, ranked settlement, spectators, direct/world chat, reconnect,
departure adjudication, replay, both AI services and mobile layouts.

Repeat the matrix in `MOBILE_QA.md` on real Android and iPhone browsers,
including WeChat. Camera scanning must be tested over the final HTTPS origin.

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
