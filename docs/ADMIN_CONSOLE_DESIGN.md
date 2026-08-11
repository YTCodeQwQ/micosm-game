# Administrator Console Design

Status: Phase 1 foundation plus the report/user portions of Phase 2 are
implemented. Separate short-lived admin sessions remain pending.

Last reviewed: 2026-08-11

## Current State

The application has a dedicated `/admin` workspace with server-enforced roles.
It includes an overview, user search, session revocation, role assignment,
report moderation, active sanctions, KataGo/Rapfi health and append-only audit
history. Desktop is the primary operating surface; mobile supports urgent
review and account restriction, not dense analytics.

Match/room inspection, ranking operations, AI availability controls,
announcements, policies and the operations dashboard remain planned. The
browser console intentionally does not expose database restore or secret edits.

## Roles

Use server-enforced permissions rather than one all-powerful client flag:

| Role | Scope |
| --- | --- |
| `super_admin` | role assignment, destructive policy changes and all modules |
| `admin` | users, matches, ranking, announcements and moderation |
| `moderator` | reports, chat deletion, warnings, mute and temporary ban |
| `support` | read-only user/match lookup and account-recovery assistance |
| `operator` | health, AI, releases, backups and incident status |

`MICO_ADMIN_PUBLIC_IDS` remains an emergency bootstrap only. Persistent roles
belong in D1 and role changes require a `super_admin` plus an audit reason.

## Navigation

### Overview

- Active users, live rooms and matchmaking queue.
- New accounts, completed matches and chat volume.
- Open reports and active sanctions.
- API error rate, WebSocket health and D1 failures.
- KataGo/Rapfi readiness, queue depth and p95 latency.
- Current release, maintenance state and last verified backup.

Use compact status bands and tables. Avoid decorative cards that make routine
operations slower to scan.

### Users

- Search by username, `MG-` ID or masked phone.
- Profile, registration time, last activity, current sessions and sanctions.
- Match/rank summary, report history and recent moderation actions.
- Warn, mute, temporary ban, permanent ban and revoke sessions.
- Start account export/deletion workflow.
- Manual rank changes only with explicit permission, reason and before/after
  audit values.

Passwords and full phone numbers are never displayed. The console cannot set a
user password directly; support initiates the verified recovery process.

### Reports And Content

- Queue filters: open, urgent, assigned, resolved and dismissed.
- Display message context, reporter history and target history.
- Assign to a moderator and add internal notes.
- Ignore, delete content, warn, mute or ban in one decision flow.
- Bulk-spam handling with a preview before execution.
- Appeal status and resolution history.

### Matches And Rooms

- Search by room code, player, mode, game and time.
- Read-only live state, spectators, connection state and action/event timeline.
- Open the archived replay after completion.
- Terminate a broken casual room with a visible reason.
- Ranked matches cannot be edited in place. A correction uses a separate,
  audited settlement-reversal operation.
- Flag repeated opponents, suspicious resignations and rating-transfer patterns.

### Ranking

- Separate Go and Gomoku ladders.
- Rating distribution, top players, suspicious streaks and settlement failures.
- Season configuration and read-only preview before activation.
- Audited corrections with automatic consistency checks.
- No ranking controls for Reversi.

### AI And Runtime

- KataGo/Rapfi versions, model hashes, host health and queue/latency metrics.
- Highest-tier availability toggle per game.
- Drain a node before restart; do not kill in-flight moves from the browser.
- View recent redacted failures and request IDs.
- Configuration display is read-only; secrets never appear in the console.

### Announcements And Policies

- Draft, preview, schedule and expire announcements.
- Versioned user agreement, privacy policy, community rules and report/appeal
  explanation pages.
- Record policy version, publish time and publisher.
- Record user acceptance when a material policy revision requires it.

The owner or a qualified reviewer supplies final legal text. The console only
manages versioning and publication.

### Audit

- Append-only view of administrator actions.
- Filters by operator, target, action, module and time.
- Before/after summaries for role, sanction, rank and configuration changes.
- Export redacts secrets, passwords, session tokens and full phone numbers.

## Critical Interaction Rules

- Every write is authorized again on the server.
- Ban, role change, rank correction, maintenance mode and policy publication
  require a reason.
- Permanent ban, mass action and destructive account deletion require a
  confirmation phrase and recent password re-authentication.
- Restore and rollback are not executed directly from the browser in the first
  version. The console displays status and links to an operator runbook.
- Admin sessions use shorter lifetimes and can be revoked independently.
- Every mutation has an idempotency key and an append-only audit record.

## API Areas

```text
/api/admin/overview
/api/admin/users
/api/admin/users/:id/actions
/api/admin/moderation
/api/admin/matches
/api/admin/ranking
/api/admin/ai
/api/admin/announcements
/api/admin/policies
/api/admin/audit
/api/admin/operations
```

Do not expose a generic SQL endpoint.

## Data Additions

- Persistent admin roles and permission grants.
- Warning/appeal cases and internal moderation notes.
- Versioned announcements and policy documents.
- Policy acceptance records.
- Account export/deletion requests.
- Rank correction records.
- Append-only admin audit entries with request IDs and before/after summaries.

All additions use versioned, additive D1 migrations.

## Delivery Phases

### Phase 1: Foundation (mostly implemented)

Implemented: dedicated layout, role/permission middleware, navigation, audit
writer and overview shell. Remaining: a separate short-lived admin session and
recent-password re-authentication flow for the highest-risk mutations.

### Phase 2: Safety And Support (partially implemented)

Implemented: moderation tools, user search, session revocation and role
assignment. Remaining: warnings, internal notes and match/replay lookup.

### Phase 3: Game Operations

Add room inspection, ranking diagnostics/corrections, AI health and feature
availability controls.

### Phase 4: Policies And Data Rights

Add announcements, versioned policy pages, acceptance records and controlled
account export/deletion workflows.

### Phase 5: Operational Visibility

Add the read-only release, backup, incident and alert views described in
`PRODUCTION_OPERATIONS_DESIGN.md`.

## Next Development Slice

Complete read-only match/replay inspection first, then ranking diagnostics and
audited correction workflows. Add AI availability controls only after their
runtime state has durable storage and a safe drain path; a browser toggle must
not terminate an in-flight engine request.
