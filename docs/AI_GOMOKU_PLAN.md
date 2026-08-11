# Gomoku AI Evaluation And Upgrade Plan

Last reviewed: 2026-08-11

Status: integration correction and first tactical release gate implemented.

## User Finding

The current Gomoku AI feels weak and slow. It has missed obvious attacking
continuations during manual play. Go AI has not yet been evaluated by a player
who knows Go, so no Go strength conclusion should be drawn from the current
manual test.

## What Is Actually Installed

The development machine currently has:

- Rapfi `0.43.01`, Clang AVX2 build.
- Official `mix9svq` Freestyle, Standard and Renju NNUE weights.
- The 2025 Rapfi model/config layout.

This is already the current official Rapfi generation, not an old toy model.
Replacing the model blindly is therefore not the first action.

Official references:

- <https://github.com/dhbloo/rapfi>
- <https://github.com/dhbloo/rapfi/releases/tag/250615>
- <https://github.com/dhbloo/rapfi-Networks>

## Implemented Baseline

`scripts/rapfi-service.mjs` now owns a prewarmed worker pool instead of spawning
an engine for every move. It sends `timeout_turn` as the per-move budget and the
protocol's unlimited value for `time_left`, resets workers between requests,
preserves ordered move history, validates every returned coordinate and exposes
startup, queue and search timing separately.

The default development capacity is two workers, four search threads and 256 MB
of transposition memory per worker. All values are host-configurable and
bounded. The default player-facing budget is 2.5 seconds.

`npm run ai:gomoku:benchmark` provides six deterministic release-gate cases
covering immediate wins and blocks for both colors in Freestyle and Renju. On
the current development machine two verified runs passed 6/6 with zero queue
time and 84-1476 ms search time. The result is hardware-specific and must
be regenerated on the production host. The model-set hash reported by that run
was `9188e45b3d1b8ca3`.

## Required Work Order

### Phase A: Build A Baseline (first gate implemented)

Create a deterministic position suite covering both colors and both Freestyle
and Renju:

- win in one;
- block opponent win in one;
- complete an open four;
- block an open four;
- create and defend double threats;
- choose a forced continuation after an open three;
- avoid black Renju overline, double-three and double-four;
- legal white responses in Renju;
- midgame positions from completed human games.

For every position record legality, expected move set, selected move, engine
version, model hash, CPU, threads, search time, queue time and total latency.
The release gate is 100% on immediate wins, immediate blocks and legality.

### Phase B: Fix The Integration (implemented)

1. Send a real match clock in `time_left`, or use the protocol's unlimited
   value when the match has no global AI clock. Keep `timeout_turn` as the
   per-move budget.
2. Introduce `RAPFI_THREADS` and `RAPFI_MEMORY_MB`, bounded to the host capacity.
3. Replace per-move process startup with a supervised persistent worker pool.
   Each worker owns one engine process and is reset between unrelated games.
4. Expose separate `startupMs`, `queueMs` and `searchMs` metrics.
5. Warm the pool during service startup and fail health until weights are loaded.
6. Preserve strict server-side legality validation for every returned move.

Do not share one mutable engine process across simultaneous games without a
proper queue and reset boundary.

### Phase C: Tune Player-Facing Tiers (initial tuning implemented)

- Easy/normal/hard may continue using fast built-in logic with distinct play
  styles.
- The highest tier uses Rapfi with a measured search budget.
- The current default is 2.5 seconds. Recheck the 1.5-2.5 second target on the
  production CPU, then
  increase only if the benchmark shows a useful strength gain.
- Show a short thinking state immediately; do not leave the board looking
  frozen.

### Phase D: Consider Another Model Or Engine

The corrected Rapfi baseline now exists. Only compare another engine/model when
the tactical suite has been expanded beyond the six immediate-threat gates.
A candidate must beat the baseline tactical score or equivalent match score at
the same p95 latency and hardware cost. It must also provide:

- Freestyle and Renju support;
- Linux server binaries or reproducible source builds;
- a license compatible with the deployment plan;
- versioned, hashable model artifacts;
- a stable protocol or service API;
- deterministic legality and timeout behavior.

Do not replace Rapfi merely because a candidate advertises a larger model.

## Go AI Position

Keep the current KataGo integration until it is reviewed with standard Go test
positions or an experienced player. Before public launch, test legal captures,
ko/superko, pass/pass scoring, resignation, handicap/board-size assumptions and
latency. Record the exact KataGo model hash and search settings in the
deployment report.

## Deployment Acceptance

- Rapfi version/model hashes are reported by health or build metadata.
- The tactical suite passes the release gate.
- p50 and p95 latency meet the selected tier target.
- Two simultaneous games do not corrupt engine state.
- Queue overflow returns a clear retryable error.
- Linux restart and warmup work under the supervisor.
- GPLv3 binary/source obligations are documented by the deployment agent.
