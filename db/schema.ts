import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  publicId: text("public_id"),
  phone: text("phone").notNull(),
  displayName: text("display_name").notNull(),
  usernameKey: text("username_key"),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  signature: text("signature").notNull().default(""),
  avatarKey: text("avatar_key"),
  role: text("role").notNull().default("player"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("users_phone_unique").on(table.phone),
  uniqueIndex("users_public_id_unique").on(table.publicId),
  uniqueIndex("users_username_key_unique").on(table.usernameKey),
]);

export const userSessions = sqliteTable("user_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const gameRooms = sqliteTable("game_rooms", {
  id: text("id").primaryKey(),
  game: text("game").notNull(),
  blackPlayer: text("black_player").notNull(),
  whitePlayer: text("white_player"),
  blackName: text("black_name"),
  whiteName: text("white_name"),
  blackAvatar: text("black_avatar"),
  whiteAvatar: text("white_avatar"),
  blackSignature: text("black_signature"),
  whiteSignature: text("white_signature"),
  hostUserId: text("host_user_id"),
  guestUserId: text("guest_user_id"),
  blackUserId: text("black_user_id"),
  whiteUserId: text("white_user_id"),
  mode: text("mode").notNull().default("private"),
  boardSize: integer("board_size").notNull().default(0),
  spectatorPolicy: text("spectator_policy").notNull().default("off"),
  state: text("state").notNull(),
  version: integer("version").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("game_rooms_lobby_idx").on(table.mode, table.spectatorPolicy, table.updatedAt)]);

export const matchmakingQueue = sqliteTable("matchmaking_queue", {
  queueKey: text("queue_key").primaryKey(),
  roomId: text("room_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const gameRoomPresence = sqliteTable("game_room_presence", {
  roomId: text("room_id").notNull(),
  playerId: text("player_id").notNull(),
  lastSeen: integer("last_seen").notNull(),
}, (table) => [
  uniqueIndex("game_room_presence_player_unique").on(table.roomId, table.playerId),
  index("game_room_presence_seen_idx").on(table.roomId, table.lastSeen),
]);

export const gameRoomSpectators = sqliteTable("game_room_spectators", {
  roomId: text("room_id").notNull(),
  userId: text("user_id").notNull(),
  lastSeen: integer("last_seen").notNull(),
}, (table) => [
  uniqueIndex("game_room_spectators_user_unique").on(table.roomId, table.userId),
  index("game_room_spectators_seen_idx").on(table.roomId, table.lastSeen),
]);

export const friendships = sqliteTable("friendships", {
  userLow: text("user_low").notNull(),
  userHigh: text("user_high").notNull(),
  requestedBy: text("requested_by").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("friendships_pair_unique").on(table.userLow, table.userHigh),
  index("friendships_status_idx").on(table.status, table.updatedAt),
]);

export const userPresence = sqliteTable("user_presence", {
  userId: text("user_id").primaryKey(),
  lastSeen: integer("last_seen").notNull(),
}, (table) => [index("user_presence_seen_idx").on(table.lastSeen)]);

export const gameInvites = sqliteTable("game_invites", {
  id: text("id").primaryKey(),
  inviterId: text("inviter_id").notNull(),
  inviteeId: text("invitee_id").notNull(),
  roomId: text("room_id").notNull(),
  game: text("game").notNull(),
  status: text("status").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("game_invites_invitee_idx").on(table.inviteeId, table.status, table.expiresAt),
  index("game_invites_room_idx").on(table.roomId, table.status),
]);

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  channel: text("channel").notNull(),
  hall: text("hall").notNull().default("main"),
  senderId: text("sender_id").notNull(),
  recipientId: text("recipient_id"),
  body: text("body").notNull().default(""),
  roomId: text("room_id"),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
}, (table) => [
  index("chat_messages_world_idx").on(table.channel, table.createdAt),
  index("chat_messages_hall_idx").on(table.channel, table.hall, table.createdAt),
  index("chat_messages_direct_idx").on(table.senderId, table.recipientId, table.createdAt),
  index("chat_messages_match_idx").on(table.channel, table.roomId, table.createdAt),
]);

export const chatReads = sqliteTable("chat_reads", {
  userId: text("user_id").notNull(),
  channel: text("channel").notNull(),
  peerId: text("peer_id").notNull().default(""),
  lastReadAt: integer("last_read_at").notNull(),
}, (table) => [uniqueIndex("chat_reads_channel_unique").on(table.userId, table.channel, table.peerId)]);

export const chatReports = sqliteTable("chat_reports", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull(),
  reporterId: text("reporter_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at").notNull(),
  status: text("status").notNull().default("open"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: integer("reviewed_at"),
  resolution: text("resolution"),
}, (table) => [uniqueIndex("chat_reports_unique").on(table.messageId, table.reporterId)]);

export const apiRateLimits = sqliteTable("api_rate_limits", {
  bucketKey: text("bucket_key").primaryKey(),
  scope: text("scope").notNull(),
  hits: integer("hits").notNull(),
  resetAt: integer("reset_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("api_rate_limits_reset_idx").on(table.resetAt)]);

export const userSanctions = sqliteTable("user_sanctions", {
  userId: text("user_id").primaryKey(),
  mutedUntil: integer("muted_until"),
  bannedUntil: integer("banned_until"),
  reason: text("reason").notNull().default(""),
  updatedBy: text("updated_by").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("user_sanctions_expiry_idx").on(table.mutedUntil, table.bannedUntil)]);

export const moderationActions = sqliteTable("moderation_actions", {
  id: text("id").primaryKey(),
  adminUserId: text("admin_user_id").notNull(),
  targetUserId: text("target_user_id"),
  messageId: text("message_id"),
  action: text("action").notNull(),
  reason: text("reason").notNull().default(""),
  durationMs: integer("duration_ms"),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("moderation_actions_created_idx").on(table.createdAt)]);

export const adminRoles = sqliteTable("admin_roles", {
  userId: text("user_id").primaryKey(),
  role: text("role").notNull(),
  assignedBy: text("assigned_by"),
  reason: text("reason").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("admin_roles_role_idx").on(table.role, table.updatedAt)]);

export const adminAuditLog = sqliteTable("admin_audit_log", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  adminUserId: text("admin_user_id").notNull(),
  adminRole: text("admin_role").notNull(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  reason: text("reason").notNull().default(""),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("admin_audit_created_idx").on(table.createdAt),
  index("admin_audit_target_idx").on(table.targetType, table.targetId, table.createdAt),
]);

export const appSchemaMigrations = sqliteTable("app_schema_migrations", {
  version: integer("version").primaryKey(),
  name: text("name").notNull(),
  appliedAt: integer("applied_at").notNull(),
});

export const betaSettings = sqliteTable("beta_settings", {
  id: text("id").primaryKey(),
  programName: text("program_name").notNull(),
  notice: text("notice").notNull(),
  updatedBy: text("updated_by"),
  updatedAt: integer("updated_at").notNull(),
});

export const betaInvites = sqliteTable("beta_invites", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  maxUses: integer("max_uses").notNull().default(0),
  uses: integer("uses").notNull().default(0),
  enabled: integer("enabled").notNull().default(1),
  expiresAt: integer("expires_at"),
  createdBy: text("created_by"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("beta_invites_code_unique").on(table.code),
  index("beta_invites_active_idx").on(table.enabled, table.expiresAt, table.createdAt),
]);

export const betaInviteClaims = sqliteTable("beta_invite_claims", {
  id: text("id").primaryKey(),
  inviteId: text("invite_id").notNull(),
  userId: text("user_id").notNull(),
  claimedAt: integer("claimed_at").notNull(),
}, (table) => [
  uniqueIndex("beta_invite_claims_user_unique").on(table.userId),
  index("beta_invite_claims_invite_idx").on(table.inviteId, table.claimedAt),
]);

export const betaFeedback = sqliteTable("beta_feedback", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  pageContext: text("page_context").notNull().default(""),
  status: text("status").notNull().default("open"),
  adminNote: text("admin_note").notNull().default(""),
  reviewedBy: text("reviewed_by"),
  reviewedAt: integer("reviewed_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("beta_feedback_status_idx").on(table.status, table.createdAt),
  index("beta_feedback_user_idx").on(table.userId, table.createdAt),
]);

export const matchEvents = sqliteTable("match_events", {
  id: text("id").primaryKey(),
  roomId: text("room_id"),
  requestId: text("request_id").notNull(),
  eventType: text("event_type").notNull(),
  actorUserId: text("actor_user_id"),
  actorPlayerId: text("actor_player_id"),
  roomVersion: integer("room_version"),
  details: text("details").notNull().default("{}"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("match_events_room_created_idx").on(table.roomId, table.createdAt),
  index("match_events_request_idx").on(table.requestId),
]);

export const matchActionReceipts = sqliteTable("match_action_receipts", {
  actionId: text("action_id").primaryKey(),
  roomId: text("room_id").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  resultingVersion: integer("resulting_version").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("match_action_receipts_room_idx").on(table.roomId, table.createdAt)]);

export const matchRecords = sqliteTable("match_records", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  roomVersion: integer("room_version").notNull(),
  game: text("game").notNull(),
  mode: text("mode").notNull(),
  boardSize: integer("board_size").notNull(),
  blackUserId: text("black_user_id"),
  whiteUserId: text("white_user_id"),
  blackName: text("black_name").notNull(),
  whiteName: text("white_name").notNull(),
  blackAvatar: text("black_avatar"),
  whiteAvatar: text("white_avatar"),
  winner: text("winner").notNull(),
  reason: text("reason").notNull(),
  state: text("state").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at").notNull(),
}, (table) => [
  uniqueIndex("match_records_room_version_unique").on(table.roomId, table.roomVersion),
  index("match_records_black_history_idx").on(table.blackUserId, table.endedAt),
  index("match_records_white_history_idx").on(table.whiteUserId, table.endedAt),
]);

export const savedGameRecords = sqliteTable("saved_game_records", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sourceRecordId: text("source_record_id"),
  title: text("title").notNull(),
  game: text("game").notNull(),
  mode: text("mode").notNull(),
  boardSize: integer("board_size").notNull(),
  blackName: text("black_name").notNull(),
  whiteName: text("white_name").notNull(),
  winner: text("winner").notNull(),
  reason: text("reason").notNull(),
  viewerRole: text("viewer_role").notNull(),
  fileJson: text("file_json").notNull(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("saved_game_records_user_recent_idx").on(table.userId, table.updatedAt),
  uniqueIndex("saved_game_records_user_source_unique").on(table.userId, table.sourceRecordId),
]);

export const rankSeasons = sqliteTable("rank_seasons", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  summary: text("summary").notNull().default(""),
  status: text("status").notNull().default("draft"),
  startsAt: integer("starts_at").notNull(),
  endsAt: integer("ends_at").notNull(),
  goEnabled: integer("go_enabled", { mode: "boolean" }).notNull().default(true),
  gomokuEnabled: integer("gomoku_enabled", { mode: "boolean" }).notNull().default(true),
  carryPercent: integer("carry_percent").notNull().default(0),
  createdBy: text("created_by"),
  activatedBy: text("activated_by"),
  closedBy: text("closed_by"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  activatedAt: integer("activated_at"),
  closedAt: integer("closed_at"),
}, (table) => [
  index("rank_seasons_status_idx").on(table.status, table.startsAt),
]);

export const rankProfiles = sqliteTable("rank_profiles", {
  userId: text("user_id").notNull(),
  game: text("game").notNull(),
  rating: integer("rating").notNull().default(0),
  peakRating: integer("peak_rating").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  matches: integer("matches").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("rank_profiles_user_game_unique").on(table.userId, table.game),
  index("rank_profiles_leaderboard_idx").on(table.game, table.rating, table.wins),
]);

export const rankedQueue = sqliteTable("ranked_queue", {
  userId: text("user_id").primaryKey(),
  roomId: text("room_id").notNull(),
  playerId: text("player_id").notNull(),
  seasonId: text("season_id"),
  game: text("game").notNull(),
  boardSize: integer("board_size").notNull(),
  rating: integer("rating").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("ranked_queue_season_match_idx").on(table.seasonId, table.game, table.boardSize, table.rating, table.createdAt)]);

export const rankMatches = sqliteTable("rank_matches", {
  roomId: text("room_id").primaryKey(),
  seasonId: text("season_id"),
  game: text("game").notNull(),
  blackUserId: text("black_user_id").notNull(),
  whiteUserId: text("white_user_id").notNull(),
  blackRatingBefore: integer("black_rating_before").notNull(),
  whiteRatingBefore: integer("white_rating_before").notNull(),
  blackDelta: integer("black_delta"),
  whiteDelta: integer("white_delta"),
  blackRatingAfter: integer("black_rating_after"),
  whiteRatingAfter: integer("white_rating_after"),
  result: text("result"),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
  settledAt: integer("settled_at"),
}, (table) => [
  index("rank_matches_players_idx").on(table.blackUserId, table.whiteUserId, table.status),
  index("rank_matches_season_idx").on(table.seasonId, table.game, table.status, table.createdAt),
]);

export const rankCorrections = sqliteTable("rank_corrections", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  game: text("game").notNull(),
  blackUserId: text("black_user_id").notNull(),
  whiteUserId: text("white_user_id").notNull(),
  blackDelta: integer("black_delta").notNull(),
  whiteDelta: integer("white_delta").notNull(),
  reason: text("reason").notNull(),
  adminUserId: text("admin_user_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("rank_corrections_room_unique").on(table.roomId),
  index("rank_corrections_created_idx").on(table.createdAt),
]);

export const rankSeasonStandings = sqliteTable("rank_season_standings", {
  seasonId: text("season_id").notNull(),
  userId: text("user_id").notNull(),
  game: text("game").notNull(),
  position: integer("position").notNull(),
  rating: integer("rating").notNull(),
  peakRating: integer("peak_rating").notNull(),
  wins: integer("wins").notNull(),
  losses: integer("losses").notNull(),
  draws: integer("draws").notNull(),
  streak: integer("streak").notNull(),
  matches: integer("matches").notNull(),
  snapshotAt: integer("snapshot_at").notNull(),
}, (table) => [
  uniqueIndex("rank_season_standings_profile_unique").on(table.seasonId, table.userId, table.game),
  index("rank_season_standings_board_idx").on(table.seasonId, table.game, table.position),
]);

export const policyDocuments = sqliteTable("policy_documents", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  body: text("body").notNull(),
  status: text("status").notNull().default("draft"),
  material: integer("material", { mode: "boolean" }).notNull().default(false),
  publishedBy: text("published_by"),
  publishedAt: integer("published_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("policy_documents_kind_version_unique").on(table.kind, table.version),
  index("policy_documents_public_idx").on(table.kind, table.status, table.publishedAt),
]);

export const policyAcceptances = sqliteTable("policy_acceptances", {
  userId: text("user_id").notNull(),
  documentId: text("document_id").notNull(),
  acceptedAt: integer("accepted_at").notNull(),
}, (table) => [
  uniqueIndex("policy_acceptances_user_document_unique").on(table.userId, table.documentId),
  index("policy_acceptances_user_idx").on(table.userId, table.acceptedAt),
]);

export const featureFlags = sqliteTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  updatedBy: text("updated_by"),
  reason: text("reason").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

export const userNotifications = sqliteTable("user_notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  actorUserId: text("actor_user_id"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  dedupeKey: text("dedupe_key"),
  readAt: integer("read_at"),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  index("user_notifications_user_idx").on(table.userId, table.createdAt),
  uniqueIndex("user_notifications_dedupe_unique").on(table.userId, table.dedupeKey),
]);
