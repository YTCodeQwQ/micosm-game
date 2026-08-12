# Production Operations Design

Status: server-side feature flags and the first operations dashboard are
implemented. External monitoring, release/incident records and backup history
remain deployment work.

Last reviewed: 2026-08-11

## Goal

The repository has health endpoints, AI supervision, backup/restore scripts, a
written rollback procedure, an audited feature-flag store and an administrator
operations view. The next step is to connect external monitoring, scheduled
backup evidence and release/incident records without making dangerous server
actions available through one browser click.

## System Of Record

- External monitoring stores high-frequency availability and latency data.
- D1 stores release metadata, incidents, administrative acknowledgements and
  low-frequency health summaries.
- The application health endpoint reports state; it is not the monitoring
  database.
- D1 and R2 backups are stored outside the application account/host when
  possible.

## Health Model

Track these components separately:

- web/API availability;
- D1 query/write health and migration version;
- R2 avatar read/write health;
- room and platform WebSocket upgrade failures;
- active Durable Object room counts;
- KataGo and Rapfi readiness, queue depth and p50/p95 move latency;
- authentication, matchmaking and ranked settlement error rates.

Use `healthy`, `degraded`, `unavailable` and `maintenance` states. One AI node
failure should degrade only the corresponding highest AI tier, not make the
entire site appear down.

## Alerts

Initial alert rules:

- three consecutive basic health failures;
- five-minute API 5xx rate above 2%;
- WebSocket upgrade/reconnect failures above 5%;
- AI queue-full events above five per minute;
- p95 highest-tier AI latency above its configured budget;
- failed ranked settlement or migration mismatch;
- backup missing or failed for more than one scheduled interval.

Alerts need owner/operator destinations, severity, acknowledgement and a link
to the relevant runbook. Secrets and personal data must be redacted.

## Backups And Restore

- Daily D1 export and R2 avatar copy.
- Retain at least seven daily and four weekly copies.
- Record checksum, size, start/end time, source resource and storage location.
- Run a restore drill into isolated resources before launch and periodically
  afterward.
- Never test restore against the live bindings.
- The admin console displays backup freshness and drill results but does not run
  restore in the first release.

## Release And Rollback

Every release record contains Git commit, deployment ID, schema versions,
operator, test totals, start/end time and rollback target. Deployment proceeds
through preview, owner smoke test, limited traffic and full traffic.

Rollback remains an operator action using the hosting platform and runbook. The
admin console may place the product in maintenance mode and show instructions,
but it must not receive cloud master credentials.

## Incident Workflow

1. Detect or receive a report.
2. Create an incident with severity and affected components.
3. Acknowledge and freeze risky releases.
4. Mitigate by disabling only the failing feature, draining an AI node, or
   rolling back the web release.
5. Verify authentication, one room, one ranked settlement, chat and realtime.
6. Close with timeline, root cause and follow-up owner.

Incident notes use request IDs, room IDs and release IDs. They exclude passwords,
cookies, phone numbers and tokens.

## Safe Feature Controls

Implemented server-side feature flags:

- registration open/closed;
- public matchmaking enabled;
- ranked Go enabled;
- ranked Gomoku enabled;
- world chat read-only;
- spectators enabled for eligible rooms;
- KataGo highest tier enabled;
- Rapfi highest tier enabled;
- global maintenance notice.

Flags are cached briefly, audited and fail toward the safer state. They do not
change match rules or rewrite an active match.

## Administrator View

The `/admin` operations section shows:

- component status and current release;
- active alerts/incidents;
- AI versions, queue and latency;
- backup freshness and latest restore drill;
- release history and rollback target;
- current feature flags and maintenance notice.

Operators can acknowledge alerts, open incidents and change approved feature
flags. Backup restore, secret changes and cloud resource deletion remain outside
the browser.

## Delivery Order

1. Define release/incident/feature-flag records and operator permissions.
2. Connect external health checks and alert delivery.
3. Schedule backups and record results.
4. Add the read-only operations dashboard. **Implemented for current runtime
   health and flags; release/backup/incident data remains.**
5. Add audited feature flags and maintenance mode. **Implemented.**
6. Complete an isolated restore and rollback drill.

Load testing is intentionally scheduled after the SMS, admin foundation and AI
integration are stable. Its scenarios and pass thresholds should be derived
from the final production topology rather than the development laptop.
