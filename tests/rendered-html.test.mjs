import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("defines the Micosm Game experience", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /Micosm Game \| Board & Logic/);
  assert.match(page, /Micosm Game/);
  assert.match(page, /围棋/);
  assert.match(page, /五子棋/);
  assert.match(page, /黑白棋/);
  assert.doesNotMatch(page, /数独/);
  assert.doesNotMatch(page, /题库/);
  assert.match(page, /排位/);
  assert.doesNotMatch(page, /codex-preview|Your site is taking shape/);
});

test("includes the complete first story season and responsive dialogue player", async () => {
  const [page, story, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/story-season-one.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /mainView.*"story"/);
  assert.match(page, /<StoryMode user=\{authUser\}/);
  assert.match(page, /micosm-story-season-one/);
  assert.match(page, /fujiwara-mio\.png/);
  assert.match(page, /shiraishi-suzune\.png/);
  assert.match(page, /返回章节列表/);
  assert.match(page, /下一话/);
  assert.match(story, /星海棋社的春日来信/);
  assert.match(story, /第一话.*第二话.*第三话.*第四话.*第五话.*第六话.*第七话.*最终话/s);
  assert.match(story, /Micosm Game/);
  assert.match(styles, /\.story-player/);
  assert.match(styles, /\.story-dialogue/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});

test("keeps standard boards, profiles, friends, and room multiplayer behavior in source", async () => {
  const [page, layout, route, engine, authRoute, auth, profileRoute, avatarRoute, friendsRoute, friends, chatRoute, chat, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/match/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/match-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/profile/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/avatar/[key]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/friends/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/friends.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/chat/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/chat.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /makeBoard\(15\)/);
  assert.match(page, /makeReversiBoard/);
  assert.match(page, /\[9, 13, 19\]/);
  assert.match(page, /boardScale/);
  assert.match(page, /max="130"/);
  assert.doesNotMatch(page, /sudokuSolution/);
  assert.match(page, /开始匹配/);
  assert.match(page, /随机执色/);
  assert.match(page, /创建好友房间/);
  assert.match(page, /输入 6 位邀请码/);
  assert.match(page, /micosm-player-name/);
  assert.match(page, /micosm-room/);
  assert.match(page, /createClientRequestId/);
  assert.match(page, /getRandomValues/);
  assert.match(page, /navigator\.sendBeacon/);
  assert.match(page, /pagehide/);
  assert.match(page, /你获胜了/);
  assert.match(page, /你输了/);
  assert.match(page, /悔棋请求已发送/);
  assert.match(page, /同意悔棋/);
  assert.match(page, /查看复盘/);
  assert.match(page, /review-controls/);
  assert.match(page, /跳到开局/);
  assert.match(page, /返回结算/);
  assert.match(page, /房主执色/);
  assert.match(page, /colorPreference/);
  assert.match(page, /undo-popover/);
  assert.match(page, /对方已逃跑，你获胜了/);
  assert.match(page, /注册并登录/);
  assert.match(page, /className="auth-error"/);
  assert.match(page, /setAuthError/);
  assert.match(page, /8 至 64 个字符/);
  assert.match(page, /确认密码/);
  assert.match(page, /手机验证码预留入口/);
  assert.match(page, /退出账号/);
  assert.match(page, /编辑个人资料/);
  assert.match(page, /个性签名/);
  assert.match(page, /通知中心/);
  assert.match(page, /游戏设置/);
  assert.match(page, /mobile-match-players/);
  assert.match(page, /pendingMove/);
  assert.match(page, /mobile-direction-pad/);
  assert.match(page, /确认落子/);
  assert.match(page, /结束并数子/);
  assert.match(page, /确认结果/);
  assert.match(page, /onDoubleClick/);
  assert.match(page, /is-opponent/);
  assert.match(page, /match-session-active/);
  assert.match(page, /mobile-match-menu-trigger/);
  assert.match(page, /has-mobile-menu/);
  assert.match(page, /对局操作/);
  assert.match(page, /落子音效/);
  assert.match(page, /最后一手标记/);
  assert.match(page, /micosm-settings/);
  assert.match(page, /toggleFavorite/);
  assert.match(page, /invitePlayers/);
  assert.match(page, /好友中心/);
  assert.match(page, /搜索用户名/);
  assert.match(page, /最近对手/);
  assert.match(page, /接受邀请/);
  assert.match(page, /inviteFriend/);
  assert.match(page, /世界频道/);
  assert.match(page, /好友私聊/);
  assert.match(page, /direct-chat-panel/);
  assert.match(page, /direct-friend-pane/);
  assert.match(page, /direct-conversation/);
  assert.match(page, /发送消息/);
  assert.match(page, /sendChatRoomInvite/);
  assert.match(page, /chat-room-invite/);
  assert.match(page, /MatchPlayerCard/);
  assert.match(page, /matchPhase/);
  assert.match(page, /已落 \$\{moveCount\} 手/);
  assert.match(page, /is-active/);
  assert.match(route, /game_rooms/);
  assert.match(route, /matchmaking_queue/);
  assert.match(route, /queueKey/);
  assert.match(route, /profiles/);
  assert.match(route, /cancelMatchmaking/);
  assert.match(route, /payload\.type === "leave"/);
  assert.match(route, /departedPlayer/);
  assert.match(route, /逃跑/);
  assert.match(route, /getSessionUser/);
  assert.match(route, /hostIsBlack/);
  assert.match(route, /rolePending/);
  assert.match(route, /waiting_for_opponent/);
  assert.match(route, /host_user_id/);
  assert.match(route, /playerIdForUser/);
  assert.match(route, /black_user_id/);
  assert.match(route, /white_user_id/);
  assert.match(route, /cannot_join_own_room/);
  assert.doesNotMatch(route, /roleFor\(row, payload\.playerId/);
  assert.match(route, /game_invites/);
  assert.match(route, /game_room_presence/);
  assert.match(route, /ROOM_DISCONNECT_MS = 30_000/);
  assert.match(route, /失去连接/);
  assert.match(engine, /not_your_turn/);
  assert.match(engine, /suicide/);
  assert.match(engine, /history\.includes\(key\)/);
  assert.match(engine, /status: "scoring"/);
  assert.match(engine, /gomokuForbidden/);
  assert.match(page, /\/api\/realtime/);
  assert.match(page, /确认数子/);
  assert.match(page, /禁手规则/);
  assert.match(engine, /illegal_reversi/);
  assert.match(engine, /RANK_TURN_MS/);
  assert.match(engine, /projectMatchClock/);
  assert.match(engine, /timedOutPlayer/);
  assert.match(engine, /requestUndo/);
  assert.match(engine, /respondUndo/);
  assert.match(engine, /undoSnapshot/);
  assert.match(engine, /moves\?: MatchMove\[\]/);
  assert.doesNotMatch(page, /detachMatch/);
  assert.match(authRoute, /type === "register"/);
  assert.match(authRoute, /type === "signIn"/);
  assert.match(authRoute, /type === "signOut"/);
  assert.match(auth, /abcd123/);
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /SHA-256/);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /users_username_key_unique/);
  assert.match(profileRoute, /avatar_too_large/);
  assert.match(profileRoute, /username_taken/);
  assert.match(profileRoute, /invalid_current_password/);
  assert.match(avatarRoute, /cache-control/);
  assert.match(friendsRoute, /sendRequest/);
  assert.match(friendsRoute, /acceptRequest/);
  assert.match(friendsRoute, /blockUser/);
  assert.match(friendsRoute, /sendGameInvite/);
  assert.match(friendsRoute, /user_presence/);
  assert.match(friends, /ONLINE_WINDOW_MS/);
  assert.match(friends, /GAME_INVITE_TTL_MS/);
  assert.match(chatRoute, /channel === "world"/);
  assert.match(chatRoute, /channel === "direct"/);
  assert.match(chatRoute, /markRead/);
  assert.match(chatRoute, /rate_limited/);
  assert.match(chatRoute, /chat_reports/);
  assert.match(chat, /WORLD_RETENTION_MS/);
  assert.match(styles, /calc\(100vw - 34px\)/);
  assert.match(styles, /touch-action: pan-y/);
  assert.match(styles, /Mobile-first play experience/);
  assert.match(styles, /\.match-library, \.info-panel \{ display: none; \}/);
  assert.match(styles, /grid-template-columns: minmax\(0,1fr\) 24px minmax\(0,1fr\)/);
  assert.match(styles, /\.move-confirm-bar/);
  assert.match(styles, /\.mobile-direction-pad/);
  assert.match(styles, /\.selected-point/);
  assert.match(styles, /\.go-end-action/);
  assert.match(styles, /calc\(100dvh - 294px\)/);
  assert.match(page, /移动落点/);
  assert.match(page, /手机主导航/);
  assert.match(page, /mobile-game-home/);
  assert.match(page, /mobile-page-open/);
  assert.match(page, /MobileWorldChannel/);
  assert.match(page, /手机世界频道/);
  assert.match(page, /mobile-world-message-list/);
  assert.match(page, /左右滑动查看更多/);
  assert.match(page, /PLAYER PROFILE/);
  assert.match(page, /和好友下一盘/);
  assert.match(page, /棋社日常/);
  assert.match(styles, /\.footer-actions\.is-open/);
  assert.match(styles, /\.mobile-primary-nav/);
  assert.match(styles, /\.mobile-page-open \.app-primary-content/);
  assert.match(styles, /\.mobile-page-open > \.chat-panel/);
  assert.match(styles, /\.mobile-page-open > \.chat-panel\.world-lobby-panel \{ display: none; \}/);
  assert.match(styles, /\.mobile-page-open > \.mobile-world-channel/);
  assert.match(styles, /\.mobile-world-composer/);
  assert.match(styles, /height: 100dvh; min-height: 0; flex-direction: column; overflow: hidden/);
  assert.match(styles, /overscroll-behavior: contain/);
  assert.match(styles, /\.mobile-home-hero/);
  assert.match(styles, /\.mobile-room-studio/);
  assert.match(styles, /\.play-footer\.has-mobile-menu \{ z-index: 72; \}/);
  assert.match(styles, /grid-template-rows: repeat\(3,27px\)/);
  assert.match(styles, /button\.stone\.black \{ background: radial-gradient\(circle closest-side at 50% 50%/);
  assert.match(styles, /button\.stone\.white \{ background: radial-gradient\(circle closest-side at 50% 50%/);
  assert.match(page, /micosm-match-table-desktop\.webp/);
  assert.match(page, /micosm-club-lobby-mobile\.webp/);
  assert.match(page, /micosm-go-scene\.webp/);
  assert.match(page, /micosm-gomoku-scene\.webp/);
  assert.match(page, /micosm-reversi-scene\.webp/);
  assert.match(styles, /micosm-ui-pattern\.webp/);
  assert.match(styles, /micosm-chibi-club\.webp/);
  assert.match(styles, /feedback-invalid/);
  assert.match(styles, /turn-breathe/);
  assert.match(styles, /match-scene-ribbon/);
  assert.match(layout, /micosm-logo\.png/);
});

test("keeps ranked play separate, persistent, and game-specific", async () => {
  const [page, matchRoute, rankRoute, rank, schema, migration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/match/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rank/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/rank.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0007_classy_kang.sql", import.meta.url), "utf8"),
  ]);

  assert.match(rank, /尘星.*微光.*星轨.*月环.*曜辰.*星穹.*天幕.*无垠/);
  assert.match(rank, /无垠 \$\{Math\.floor/);
  assert.match(rank, /WIN_POINTS = \[36, 33, 30, 27, 24, 22, 20, 18\]/);
  assert.match(matchRoute, /payload\.type === "rankmake"/);
  assert.match(matchRoute, /\["go", "gomoku"\]/);
  assert.match(matchRoute, /"ranked" && !\["play", "pass", "markDead", "confirmScore", "resumeGo", "resign"\]/);
  assert.match(matchRoute, /settleRankedMatch/);
  assert.match(matchRoute, /resolveMatchTimeout/);
  assert.match(matchRoute, /startRankedClock/);
  assert.match(matchRoute, /turnSeconds/);
  assert.match(matchRoute, /invalid_clock/);
  assert.match(matchRoute, /RANK_SETTLEMENT_STALE_MS/);
  assert.match(matchRoute, /await d1\.batch\(\[/);
  assert.match(matchRoute, /status = 'settling' AND settled_at = \?/);
  assert.match(rankRoute, /rank_profiles/);
  assert.match(rankRoute, /leaderboard/);
  assert.match(schema, /rankProfiles/);
  assert.match(schema, /rankedQueue/);
  assert.match(schema, /rankMatches/);
  assert.match(migration, /CREATE TABLE `rank_profiles`/);
  assert.match(page, /开始\{game === "go" \? "围棋" : "五子棋"\}排位/);
  assert.match(page, /黑白棋不参与排位/);
  assert.match(page, /排位对局不能悔棋/);
  assert.match(page, /对方超时，你获胜了/);
  assert.match(page, /formatMatchClock/);
  assert.match(page, /rank-clock-strip/);
  assert.match(page, /privateClockEnabled/);
  assert.match(page, /每手用时（秒）/);
  assert.match(page, /requestRematch/);
  assert.match(page, /对方拒绝了你的悔棋请求/);
  assert.match(page, /roomQrDataUrl/);
  assert.match(page, /扫描房间二维码/);
  assert.match(page, /BrowserQRCodeReader/);
  assert.match(page, /searchParams\.get\("room"\)/);
  assert.match(page, /拍照识别/);
  assert.match(page, /VITE_LAN_ORIGIN/);
  assert.match(page, /返回排位/);
  assert.match(page, /RANK_EMBLEMS.*dust-star.*faint-glow.*star-track.*moon-ring.*radiant-star.*star-vault.*sky-veil.*boundless/s);
  assert.match(page, /RANK_MOTTO/);
  assert.match(page, /RankEmblemArt/);
});

test("offers portable human-versus-AI play with real KataGo and Rapfi tiers", async () => {
  const [page, route, aiRoute, engine, kataGoService, rapfiService, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/match/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ai/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ai-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/katago-service.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/rapfi-service.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /人机对战/);
  assert.match(page, /挑战电脑棋手/);
  assert.match(page, /星芽.*微光.*曜辰.*无垠/s);
  assert.match(page, /KataGo GPU 已就绪/);
  assert.match(page, /Rapfi NNUE 已就绪/);
  assert.match(page, /type: "createAI"/);
  assert.match(page, /type: "aiMove"/);
  assert.match(page, /再次挑战/);
  assert.match(route, /payload\.type === "createAI"/);
  assert.match(route, /payload\.type === "aiMove"/);
  assert.match(route, /AI_SERVICE_ORIGIN/);
  assert.match(route, /AI_KATAGO_VISITS/);
  assert.match(route, /AI_KATAGO_SECONDS/);
  assert.match(route, /RAPFI_SERVICE_ORIGIN/);
  assert.match(route, /AI_RAPFI_SECONDS/);
  assert.match(aiRoute, /AI_SERVICE_TOKEN/);
  assert.match(engine, /chooseBuiltInAiAction/);
  assert.match(kataGoService, /KATAGO_EXE/);
  assert.match(kataGoService, /KATAGO_MODEL/);
  assert.match(kataGoService, /KATAGO_SERVICE_HOST/);
  assert.match(kataGoService, /KATAGO_SERVICE_TOKEN/);
  assert.match(rapfiService, /RAPFI_EXE/);
  assert.match(rapfiService, /mix9svq/);
  assert.match(rapfiService, /INFO rule/);
  assert.match(rapfiService, /RAPFI_SERVICE_TOKEN/);
  assert.match(styles, /\.ai-difficulty-grid/);
  assert.match(styles, /\.lobby-ai-button/);
});

test("provides public player IDs, resignation, archived matches, and replay analysis", async () => {
  const [page, auth, authRoute, friendRoute, historyRoute, matchHistory, matchEngine, matchRoute, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/friends/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/history/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/match-history.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/match-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/match/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(auth, /publicUserIdForInternalId/);
  assert.match(auth, /MG-/);
  assert.match(auth, /CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_unique/);
  assert.match(authRoute, /public_id/);
  assert.match(friendRoute, /UPPER\(u\.public_id\) = \?/);
  assert.match(matchEngine, /type: "resign"/);
  assert.match(matchEngine, /resignedPlayer: player/);
  assert.match(matchRoute, /archiveFinishedMatch/);
  assert.match(matchHistory, /CREATE TABLE IF NOT EXISTS match_records/);
  assert.match(matchHistory, /UNIQUE\(room_id, room_version\)/);
  assert.match(historyRoute, /match_records/);
  assert.match(historyRoute, /black_user_id = \? OR white_user_id = \?/);
  assert.match(page, /HistoryCenter/);
  assert.match(page, /buildReviewFrames/);
  assert.match(page, /gomokuWinningPoints/);
  assert.match(page, /type: "resign"/);
  assert.match(styles, /\.history-shell/);
  assert.match(styles, /\.review-insight-strip/);
});
