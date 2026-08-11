import assert from "node:assert/strict";
import test from "node:test";

const origin = process.env.MICOSM_TEST_ORIGIN?.replace(/\/$/, "");

class TestClient {
  cookie = "";

  async request(path, init = {}) {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    const response = await fetch(`${origin}${path}`, { ...init, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";", 1)[0];
    const data = await response.json();
    return { response, data };
  }

  post(path, body, headers = {}) {
    return this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }
}

function uniqueIdentity(prefix, phonePrefix) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  return { displayName: `${prefix}${suffix.slice(-6)}`, phone: `${phonePrefix}${suffix}` };
}

async function register(client, identity) {
  const { response, data } = await client.post("/api/auth", {
    type: "register",
    ...identity,
    password: "v02-test-password",
    inviteCode: "abcd123",
  });
  assert.equal(response.status, 201, JSON.stringify(data));
  assert.ok(data.user?.id);
  return data.user;
}

test("spectating policies keep ranked private and require matchmaking consent", { skip: !origin }, async () => {
  const host = new TestClient();
  const guest = new TestClient();
  const friend = new TestClient();
  const stranger = new TestClient();
  const hostUser = await register(host, uniqueIdentity("V03H", "133"));
  await register(guest, uniqueIdentity("V03G", "132"));
  const friendUser = await register(friend, uniqueIdentity("V03F", "131"));
  await register(stranger, uniqueIdentity("V03X", "130"));

  const privateRoom = await host.post("/api/match", {
    type: "create",
    game: "go",
    size: 13,
    colorPreference: "black",
    spectatorPolicy: "friends",
  });
  assert.equal(privateRoom.response.status, 201, JSON.stringify(privateRoom.data));
  const privateRoomId = privateRoom.data.room.id;

  const strangerBeforeFriendship = await stranger.request(`/api/match?roomId=${privateRoomId}`);
  assert.equal(strangerBeforeFriendship.response.status, 403);
  assert.equal(strangerBeforeFriendship.data.error.code, "spectating_forbidden");

  await host.post("/api/friends", { type: "sendRequest", targetUserId: friendUser.id });
  const accepted = await friend.post("/api/friends", { type: "acceptRequest", targetUserId: hostUser.id });
  assert.equal(accepted.response.status, 200, JSON.stringify(accepted.data));
  const friendLobby = await friend.request("/api/lobby?hall=go");
  assert.equal(friendLobby.response.status, 200, JSON.stringify(friendLobby.data));
  assert.ok(friendLobby.data.rooms.some((room) => room.id === privateRoomId && room.joinable));

  const joinedPrivate = await guest.post("/api/match", { type: "join", roomId: privateRoomId });
  assert.equal(joinedPrivate.response.status, 200, JSON.stringify(joinedPrivate.data));
  const friendSpectates = await friend.request(`/api/match?roomId=${privateRoomId}`);
  assert.equal(friendSpectates.response.status, 200, JSON.stringify(friendSpectates.data));
  assert.equal(friendSpectates.data.room.role, null);
  assert.equal(friendSpectates.data.room.spectatorPolicy, "friends");

  const forbiddenAction = await friend.post("/api/match", {
    type: "action",
    roomId: privateRoomId,
    playerId: "spectator",
    actionId: crypto.randomUUID(),
    action: { type: "play", row: 6, col: 6 },
  });
  assert.equal(forbiddenAction.response.status, 403);

  const rankedFirst = await host.post("/api/match", { type: "rankmake", game: "gomoku" });
  assert.equal(rankedFirst.response.status, 201, JSON.stringify(rankedFirst.data));
  const rankedSecond = await guest.post("/api/match", { type: "rankmake", game: "gomoku" });
  assert.equal(rankedSecond.response.status, 200, JSON.stringify(rankedSecond.data));
  const rankedSpectate = await stranger.request(`/api/match?roomId=${rankedFirst.data.room.id}`);
  assert.equal(rankedSpectate.response.status, 403);
  assert.equal(rankedSpectate.data.error.code, "spectating_forbidden");

  const matchmakingFirst = await friend.post("/api/match", { type: "matchmake", game: "reversi", size: 8 });
  assert.equal(matchmakingFirst.response.status, 201, JSON.stringify(matchmakingFirst.data));
  const matchmakingSecond = await stranger.post("/api/match", { type: "matchmake", game: "reversi", size: 8 });
  assert.equal(matchmakingSecond.response.status, 200, JSON.stringify(matchmakingSecond.data));
  const matchmakingRoomId = matchmakingFirst.data.room.id;

  const firstConsent = await friend.post("/api/match", { type: "spectatorConsent", roomId: matchmakingRoomId, enabled: true });
  assert.equal(firstConsent.response.status, 200, JSON.stringify(firstConsent.data));
  assert.equal(firstConsent.data.room.spectatorPolicy, "off");
  const blockedAfterOneConsent = await host.request(`/api/match?roomId=${matchmakingRoomId}`);
  assert.equal(blockedAfterOneConsent.response.status, 403);

  const secondConsent = await stranger.post("/api/match", { type: "spectatorConsent", roomId: matchmakingRoomId, enabled: true });
  assert.equal(secondConsent.response.status, 200, JSON.stringify(secondConsent.data));
  assert.equal(secondConsent.data.room.spectatorPolicy, "public");
  const publicLobby = await host.request("/api/lobby?hall=reversi");
  assert.equal(publicLobby.response.status, 200, JSON.stringify(publicLobby.data));
  assert.ok(publicLobby.data.rooms.some((room) => room.id === matchmakingRoomId && room.spectatable));
  const allowedAfterBothConsent = await host.request(`/api/match?roomId=${matchmakingRoomId}`);
  assert.equal(allowedAfterBothConsent.response.status, 200, JSON.stringify(allowedAfterBothConsent.data));
  assert.equal(allowedAfterBothConsent.data.room.role, null);

  const consentRevoked = await friend.post("/api/match", { type: "spectatorConsent", roomId: matchmakingRoomId, enabled: false });
  assert.equal(consentRevoked.response.status, 200, JSON.stringify(consentRevoked.data));
  assert.equal(consentRevoked.data.room.spectatorPolicy, "off");
  const blockedAfterRevoke = await host.request(`/api/match?roomId=${matchmakingRoomId}`);
  assert.equal(blockedAfterRevoke.response.status, 403);
});

test("two users can complete a private match with idempotent actions and diagnostics", { skip: !origin }, async () => {
  const host = new TestClient();
  const guest = new TestClient();
  await register(host, uniqueIdentity("V02A", "139"));
  await register(guest, uniqueIdentity("V02B", "138"));

  const created = await host.post("/api/match", {
    type: "create",
    game: "gomoku",
    size: 15,
    colorPreference: "black",
    turnSeconds: 60,
    forbiddenMoves: true,
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const roomId = created.data.room.id;
  const hostPlayerId = created.data.playerId;
  assert.equal(created.data.room.role, "black");

  const joined = await guest.post("/api/match", { type: "join", roomId });
  assert.equal(joined.response.status, 200, JSON.stringify(joined.data));
  const guestPlayerId = joined.data.playerId;
  assert.equal(joined.data.room.role, "white");

  const firstActionId = crypto.randomUUID();
  const firstMove = await host.post("/api/match", {
    type: "action",
    roomId,
    playerId: hostPlayerId,
    actionId: firstActionId,
    action: { type: "play", row: 7, col: 7 },
  }, { "x-micosm-request-id": firstActionId });
  assert.equal(firstMove.response.status, 200, JSON.stringify(firstMove.data));
  assert.equal(firstMove.data.room.state.moves.length, 1);
  const versionAfterMove = firstMove.data.room.version;

  const duplicateMove = await host.post("/api/match", {
    type: "action",
    roomId,
    playerId: hostPlayerId,
    actionId: firstActionId,
    action: { type: "play", row: 7, col: 7 },
  });
  assert.equal(duplicateMove.response.status, 200, JSON.stringify(duplicateMove.data));
  assert.equal(duplicateMove.data.duplicate, true);
  assert.equal(duplicateMove.data.room.version, versionAfterMove);
  assert.equal(duplicateMove.data.room.state.moves.length, 1);

  const invalidActionId = crypto.randomUUID();
  const invalidMove = await guest.post("/api/match", {
    type: "action",
    roomId,
    playerId: guestPlayerId,
    actionId: invalidActionId,
    action: { type: "play", row: 7, col: 7 },
  }, { "x-micosm-request-id": invalidActionId });
  assert.equal(invalidMove.response.status, 409);
  assert.equal(invalidMove.data.error.requestId, invalidActionId);
  assert.equal(invalidMove.response.headers.get("x-micosm-request-id"), invalidActionId);

  const undoRequest = await host.post("/api/match", {
    type: "action",
    roomId,
    playerId: hostPlayerId,
    actionId: crypto.randomUUID(),
    action: { type: "requestUndo" },
  });
  assert.equal(undoRequest.response.status, 200, JSON.stringify(undoRequest.data));
  assert.equal(undoRequest.data.room.state.undoRequest.requester, "black");

  const undoRejected = await guest.post("/api/match", {
    type: "action",
    roomId,
    playerId: guestPlayerId,
    actionId: crypto.randomUUID(),
    action: { type: "respondUndo", accept: false },
  });
  assert.equal(undoRejected.response.status, 200, JSON.stringify(undoRejected.data));
  assert.match(undoRejected.data.room.state.notice, /拒绝/);

  const resignActionId = crypto.randomUUID();
  const resigned = await host.post("/api/match", {
    type: "action",
    roomId,
    playerId: hostPlayerId,
    actionId: resignActionId,
    action: { type: "resign" },
  });
  assert.equal(resigned.response.status, 200, JSON.stringify(resigned.data));
  assert.equal(resigned.data.room.state.status, "ended");
  assert.equal(resigned.data.room.state.winner, "white");

  const duplicateResign = await host.post("/api/match", {
    type: "action",
    roomId,
    playerId: hostPlayerId,
    actionId: resignActionId,
    action: { type: "resign" },
  });
  assert.equal(duplicateResign.response.status, 200, JSON.stringify(duplicateResign.data));
  assert.equal(duplicateResign.data.duplicate, true);

  const history = await guest.request("/api/history");
  assert.equal(history.response.status, 200, JSON.stringify(history.data));
  assert.equal(history.data.records.filter((record) => record.roomId === roomId).length, 1);

  const diagnostics = await guest.request(`/api/diagnostics?roomId=${roomId}`);
  assert.equal(diagnostics.response.status, 200, JSON.stringify(diagnostics.data));
  const eventTypes = diagnostics.data.events.map((event) => event.type);
  assert.ok(eventTypes.includes("room_created"));
  assert.ok(eventTypes.includes("room_joined"));
  assert.ok(eventTypes.includes("match_action"));
});

test("ranked settlement is applied once and a refreshed client recovers its role", { skip: !origin }, async () => {
  const first = new TestClient();
  const second = new TestClient();
  await register(first, uniqueIdentity("V02R", "137"));
  await register(second, uniqueIdentity("V02S", "136"));

  const waiting = await first.post("/api/match", { type: "rankmake", game: "gomoku" });
  assert.equal(waiting.response.status, 201, JSON.stringify(waiting.data));
  const roomId = waiting.data.room.id;

  const matched = await second.post("/api/match", { type: "rankmake", game: "gomoku" });
  assert.equal(matched.response.status, 200, JSON.stringify(matched.data));
  assert.equal(matched.data.room.id, roomId);
  assert.equal(matched.data.room.opponentReady, true);

  const refreshed = new TestClient();
  refreshed.cookie = first.cookie;
  const recovered = await refreshed.request(`/api/match?roomId=${roomId}`);
  assert.equal(recovered.response.status, 200, JSON.stringify(recovered.data));
  assert.ok(["black", "white"].includes(recovered.data.room.role));
  assert.equal(recovered.data.room.opponentReady, true);

  const resignActionId = crypto.randomUUID();
  const resigned = await refreshed.post("/api/match", {
    type: "action",
    roomId,
    playerId: waiting.data.playerId,
    actionId: resignActionId,
    action: { type: "resign" },
  });
  assert.equal(resigned.response.status, 200, JSON.stringify(resigned.data));
  assert.equal(resigned.data.room.state.status, "ended");

  const firstRankAfter = await first.request("/api/rank?game=gomoku");
  const secondRankAfter = await second.request("/api/rank?game=gomoku");
  assert.equal(firstRankAfter.data.profiles.gomoku.matches, 1);
  assert.equal(secondRankAfter.data.profiles.gomoku.matches, 1);
  const ratingsAfter = [firstRankAfter.data.profiles.gomoku.rating, secondRankAfter.data.profiles.gomoku.rating];

  const duplicate = await refreshed.post("/api/match", {
    type: "action",
    roomId,
    playerId: waiting.data.playerId,
    actionId: resignActionId,
    action: { type: "resign" },
  });
  assert.equal(duplicate.response.status, 200, JSON.stringify(duplicate.data));
  assert.equal(duplicate.data.duplicate, true);

  const firstRankFinal = await first.request("/api/rank?game=gomoku");
  const secondRankFinal = await second.request("/api/rank?game=gomoku");
  assert.deepEqual(
    [firstRankFinal.data.profiles.gomoku.rating, secondRankFinal.data.profiles.gomoku.rating],
    ratingsAfter,
  );
  assert.equal(firstRankFinal.data.profiles.gomoku.matches, 1);
  assert.equal(secondRankFinal.data.profiles.gomoku.matches, 1);

  const firstHistory = await first.request("/api/history");
  assert.equal(firstHistory.data.records.filter((record) => record.roomId === roomId).length, 1);
});

test("an opponent that stays disconnected for thirty seconds loses by departure", { skip: !origin, timeout: 45_000 }, async () => {
  const present = new TestClient();
  const departed = new TestClient();
  await register(present, uniqueIdentity("V02P", "135"));
  await register(departed, uniqueIdentity("V02D", "134"));

  const created = await present.post("/api/match", {
    type: "create",
    game: "gomoku",
    colorPreference: "black",
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const roomId = created.data.room.id;
  const joined = await departed.post("/api/match", { type: "join", roomId });
  assert.equal(joined.response.status, 200, JSON.stringify(joined.data));

  await new Promise((resolve) => setTimeout(resolve, 31_000));
  const resolved = await present.request(`/api/match?roomId=${roomId}`);
  assert.equal(resolved.response.status, 200, JSON.stringify(resolved.data));
  assert.equal(resolved.data.room.state.status, "ended");
  assert.equal(resolved.data.room.state.winner, "black");
  assert.equal(resolved.data.room.state.departedPlayer, "white");

  const opponentView = await departed.request(`/api/match?roomId=${roomId}`);
  assert.equal(opponentView.response.status, 200, JSON.stringify(opponentView.data));
  assert.equal(opponentView.data.room.state.status, "ended");
  assert.equal(opponentView.data.room.state.departedPlayer, "white");

  const history = await present.request("/api/history");
  const record = history.data.records.find((item) => item.roomId === roomId);
  assert.equal(record?.reason, "departure");
});

test("Go scoring uses the same 7.5 point komi through the room API", { skip: !origin }, async () => {
  const black = new TestClient();
  const white = new TestClient();
  await register(black, uniqueIdentity("V02K", "151"));
  await register(white, uniqueIdentity("V02W", "152"));

  const created = await black.post("/api/match", {
    type: "create",
    game: "go",
    size: 9,
    colorPreference: "black",
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const roomId = created.data.room.id;
  const joined = await white.post("/api/match", { type: "join", roomId });
  assert.equal(joined.response.status, 200, JSON.stringify(joined.data));

  const blackPass = await black.post("/api/match", {
    type: "action",
    roomId,
    playerId: created.data.playerId,
    actionId: crypto.randomUUID(),
    action: { type: "pass" },
  });
  assert.equal(blackPass.response.status, 200, JSON.stringify(blackPass.data));

  const whitePass = await white.post("/api/match", {
    type: "action",
    roomId,
    playerId: joined.data.playerId,
    actionId: crypto.randomUUID(),
    action: { type: "pass" },
  });
  assert.equal(whitePass.response.status, 200, JSON.stringify(whitePass.data));
  assert.equal(whitePass.data.room.state.status, "scoring");
  assert.deepEqual(whitePass.data.room.state.goScoring.score, { black: 0, white: 7.5 });

  const blackConfirmed = await black.post("/api/match", {
    type: "action",
    roomId,
    playerId: created.data.playerId,
    actionId: crypto.randomUUID(),
    action: { type: "confirmScore" },
  });
  assert.equal(blackConfirmed.response.status, 200, JSON.stringify(blackConfirmed.data));
  assert.equal(blackConfirmed.data.room.state.status, "scoring");

  const whiteConfirmed = await white.post("/api/match", {
    type: "action",
    roomId,
    playerId: joined.data.playerId,
    actionId: crypto.randomUUID(),
    action: { type: "confirmScore" },
  });
  assert.equal(whiteConfirmed.response.status, 200, JSON.stringify(whiteConfirmed.data));
  assert.equal(whiteConfirmed.data.room.state.status, "ended");
  assert.equal(whiteConfirmed.data.room.state.winner, "white");
  assert.deepEqual(whiteConfirmed.data.room.state.finalScore, { black: 0, white: 7.5 });
});
