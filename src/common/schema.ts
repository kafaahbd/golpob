import { pgTable, uuid, varchar, text, boolean, timestamp, pgEnum, integer } from 'drizzle-orm/pg-core';

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────
export const messageTypeEnum = pgEnum('message_type', ['text', 'image', 'voice']);
export const memberRoleEnum = pgEnum('member_role', ['admin', 'member']);
export const callTypeEnum = pgEnum('call_type', ['audio', 'video']);
export const callStatusEnum = pgEnum('call_status', ['missed', 'accepted', 'rejected']);

// ─────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 30 }),
  nickname: varchar('nickname', { length: 80 }).notNull(),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash'),
  verified: boolean('verified').default(false).notNull(),
  publicKey: text('public_key'),
  fcmToken: text('fcm_token'),
  lastSeen: timestamp('last_seen', { withTimezone: true }),
  isOnline: boolean('is_online').default(false),
  pinnedChats: text('pinned_chats').array().default([]),
  archivedChats: text('archived_chats').array().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────
// OTP CODES
// ─────────────────────────────────────────────
export const otpCodes = pgTable('otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  otpHash: text('otp_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  resendCount: integer('resend_count').default(0),
  lastResendAt: timestamp('last_resend_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────
// CHATS
// ─────────────────────────────────────────────
export const chats = pgTable('chats', {
  id: uuid('id').primaryKey().defaultRandom(),
  isGroup: boolean('is_group').default(false).notNull(),
  groupName: varchar('group_name', { length: 120 }),
  groupAvatar: text('group_avatar'),
  lastMessageId: uuid('last_message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────
// CHAT MEMBERS
// ─────────────────────────────────────────────
export const chatMembers = pgTable('chat_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: memberRoleEnum('role').default('member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => users.id),
  encryptedContent: text('encrypted_content').notNull(),
  type: messageTypeEnum('type').default('text').notNull(),
  mediaUrl: text('media_url'),
  mediaMeta: text('media_meta'), // JSON: size, duration, etc.
  replyToId: uuid('reply_to_id'),
  isDeleted: boolean('is_deleted').default(false),
  deletedForEveryone: boolean('deleted_for_everyone').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────
// MESSAGE STATUS
// ─────────────────────────────────────────────
export const messageStatuses = pgTable('message_statuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  delivered: boolean('delivered').default(false),
  seen: boolean('seen').default(false),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  seenAt: timestamp('seen_at', { withTimezone: true }),
});

// ─────────────────────────────────────────────
// REACTIONS
// ─────────────────────────────────────────────
export const reactions = pgTable('reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  reactionType: varchar('reaction_type', { length: 10 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────
// BLOCKS
// ─────────────────────────────────────────────
export const blocks = pgTable('blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockerId: uuid('blocker_id').notNull().references(() => users.id),
  blockedId: uuid('blocked_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────
// CALLS
// ─────────────────────────────────────────────
export const calls = pgTable('calls', {
  id: uuid('id').primaryKey().defaultRandom(),
  callerId: uuid('caller_id').notNull().references(() => users.id),
  receiverId: uuid('receiver_id').notNull().references(() => users.id),
  type: callTypeEnum('type').notNull(),
  status: callStatusEnum('status').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─────────────────────────────────────────────
// TYPE EXPORTS
// ─────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type Chat = typeof chats.$inferSelect;
export type ChatMember = typeof chatMembers.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
export type Block = typeof blocks.$inferSelect;
export type Call = typeof calls.$inferSelect;
