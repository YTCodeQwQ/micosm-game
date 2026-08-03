import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  displayName: text("display_name").notNull(),
  usernameKey: text("username_key"),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  signature: text("signature").notNull().default(""),
  avatarKey: text("avatar_key"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  uniqueIndex("users_phone_unique").on(table.phone),
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
  state: text("state").notNull(),
  version: integer("version").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

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
  senderId: text("sender_id").notNull(),
  recipientId: text("recipient_id"),
  body: text("body").notNull().default(""),
  roomId: text("room_id"),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
}, (table) => [
  index("chat_messages_world_idx").on(table.channel, table.createdAt),
  index("chat_messages_direct_idx").on(table.senderId, table.recipientId, table.createdAt),
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
}, (table) => [uniqueIndex("chat_reports_unique").on(table.messageId, table.reporterId)]);

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
  game: text("game").notNull(),
  boardSize: integer("board_size").notNull(),
  rating: integer("rating").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [index("ranked_queue_match_idx").on(table.game, table.boardSize, table.rating, table.createdAt)]);

export const rankMatches = sqliteTable("rank_matches", {
  roomId: text("room_id").primaryKey(),
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
}, (table) => [index("rank_matches_players_idx").on(table.blackUserId, table.whiteUserId, table.status)]);
