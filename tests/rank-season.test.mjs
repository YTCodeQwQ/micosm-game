import assert from "node:assert/strict";
import test from "node:test";

import { publicRankSeason, rankSeasonForGame } from "../lib/rank.ts";

function season(overrides = {}) {
  const now = Date.now();
  return {
    id: "season-test", code: "S-TEST", name: "测试赛季", summary: "",
    status: "active", starts_at: now - 60_000, ends_at: now + 60_000,
    go_enabled: 1, gomoku_enabled: 1, carry_percent: 50,
    created_by: null, activated_by: null, closed_by: null,
    created_at: now, updated_at: now, activated_at: now, closed_at: null,
    ...overrides,
  };
}

function seasonDatabase(initial, roomIds = []) {
  const state = { season: { ...initial }, queue: [...roomIds], removedRooms: [] };
  return {
    state,
    prepare(query) {
      let values = [];
      return {
        bind(...next) { values = next; return this; },
        async first() {
          if (query.includes("status IN ('active', 'closing')")) return ["active", "closing"].includes(state.season.status) ? { ...state.season } : null;
          if (query.includes("FROM rank_seasons ORDER BY")) return { ...state.season };
          return null;
        },
        async all() {
          if (query.includes("SELECT room_id FROM ranked_queue")) return { results: state.queue.map((room_id) => ({ room_id })) };
          return { results: [] };
        },
        async run() {
          if (query.includes("UPDATE rank_seasons SET status = 'closing'") && state.season.status === "active") {
            state.season.status = "closing";
            state.season.updated_at = values[0];
            return { meta: { changes: 1 } };
          }
          if (query.includes("DELETE FROM game_rooms")) state.removedRooms.push(values[0]);
          if (query.includes("DELETE FROM ranked_queue")) state.queue = [];
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

test("an enabled active season allows only its configured games", async () => {
  const d1 = seasonDatabase(season({ gomoku_enabled: 0 }));
  const go = await rankSeasonForGame(d1, "go");
  const gomoku = await rankSeasonForGame(d1, "gomoku");
  assert.equal(go.playable, true);
  assert.equal(gomoku.playable, false);
  assert.match(gomoku.reason, /五子棋未在本赛季开放/);
  assert.equal(publicRankSeason(d1.state.season).name, "测试赛季");
});

test("an expired active season stops entry and clears waiting rooms", async () => {
  const d1 = seasonDatabase(season({ ends_at: Date.now() - 1 }), ["room-a", "room-b"]);
  const result = await rankSeasonForGame(d1, "go");
  assert.equal(result.playable, false);
  assert.equal(result.season.status, "closing");
  assert.match(result.reason, /停止报名/);
  assert.deepEqual(d1.state.queue, []);
  assert.deepEqual(d1.state.removedRooms, ["room-a", "room-b"]);
});
