import assert from "node:assert/strict";
import test from "node:test";

import { parseWorkspaceState, serializeWorkspaceState } from "../lib/workspace-state.ts";

test("workspace state restores every persistent top-level destination", () => {
  for (const view of ["games", "community", "ranked", "history"]) {
    const serialized = serializeWorkspaceState({
      view,
      panel: null,
      communityLive: view === "community",
      communityEntry: "announcements",
      lobbyHall: "gomoku",
    });
    const restored = parseWorkspaceState(serialized);
    assert.equal(restored.view, view);
    assert.equal(restored.communityLive, view === "community");
    assert.equal(restored.communityEntry, "announcements");
    assert.equal(restored.lobbyHall, "gomoku");
  }
});

test("workspace state restores mobile world, friends, and account pages", () => {
  for (const panel of ["world", "friends", "account"]) {
    const restored = parseWorkspaceState(JSON.stringify({ view: "games", panel }));
    assert.equal(restored.panel, panel);
  }
});

test("workspace state safely accepts the legacy view key and rejects invalid data", () => {
  assert.equal(parseWorkspaceState(null, "ranked").view, "ranked");
  assert.deepEqual(parseWorkspaceState("not-json", "unknown"), {
    version: 1,
    view: "games",
    panel: null,
    communityLive: false,
    communityEntry: "discussion",
    lobbyHall: "main",
  });
});
