import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { RedisService } from '../common/redis.service';
import { UsersService } from '../users/users.service';
import { SupabaseService } from '../common/supabase.service';
import { chats, chatMembers, messages, users } from '../common/schema';
import { eq, and, inArray, desc , sql } from 'drizzle-orm';

@Injectable()
export class ChatService {
  constructor(
    private db: DatabaseService,
    private redis: RedisService,
    private usersService: UsersService,
    private supabase: SupabaseService,
  ) {}

  // ─── Get or Create DM chat ───────────────────────────────────────────────
  async getOrCreateDm(userId: string, targetId: string) {
    const isBlocked = await this.usersService.isBlocked(userId, targetId);
    if (isBlocked) throw new ForbiddenException('Cannot message a blocked user');

    // Find existing DM between these two users
    const existing = await this.db.getDb().execute(sql`
  SELECT c.id FROM chats c
  INNER JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ${userId}
  INNER JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ${targetId}
  WHERE c.is_group = false
  LIMIT 1
`);

    if (existing.rows?.length > 0) {
  const chatId = existing.rows[0].id as string; // এখানে 'as string' যোগ করুন
  return this.getChatDetails(chatId, userId);
}

    // Create new DM
    const [chat] = await this.db.getDb().insert(chats).values({ isGroup: false }).returning();
    await this.db.getDb().insert(chatMembers).values([
      { chatId: chat.id, userId, role: 'member' },
      { chatId: chat.id, userId: targetId, role: 'member' },
    ]);

    return this.getChatDetails(chat.id, userId);
  }

  // ─── Create Group ────────────────────────────────────────────────────────
  async createGroup(userId: string, name: string, memberIds: string[], avatarFile?: Express.Multer.File) {
    const [chat] = await this.db.getDb().insert(chats).values({
      isGroup: true,
      groupName: name,
    }).returning();

    const allMembers = [...new Set([userId, ...memberIds])];
    await this.db.getDb().insert(chatMembers).values(
  allMembers.map((uid) => ({
    chatId: chat.id,
    userId: uid,
    role: (uid === userId ? 'admin' : 'member') as 'admin' | 'member', // এখানে কাস্ট করুন
  })),
);

    if (avatarFile) {
      const url = await this.supabase.uploadGroupAvatar(chat.id, avatarFile);
      await this.db.getDb().update(chats).set({ groupAvatar: url }).where(eq(chats.id, chat.id));
    }

    return this.getChatDetails(chat.id, userId);
  }

  // ─── Get User's Chat List ─────────────────────────────────────────────────
  async getUserChats(userId: string) {
    const memberships = await this.db.getDb().query.chatMembers.findMany({
      where: eq(chatMembers.userId, userId),
    });

    const chatIds = memberships.map((m) => m.chatId);
    if (!chatIds.length) return [];

    const chatList = await Promise.all(chatIds.map((id) => this.getChatDetails(id, userId)));
    return chatList.filter(Boolean).sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
  }

  // ─── Get Chat Details ─────────────────────────────────────────────────────
  async getChatDetails(chatId: string, currentUserId: string) {
    const chat = await this.db.getDb().query.chats.findFirst({
      where: eq(chats.id, chatId),
    });
    if (!chat) return null;

    const members = await this.db.getDb().query.chatMembers.findMany({
      where: eq(chatMembers.chatId, chatId),
    });

    const memberUsers = await Promise.all(
      members.map(async (m) => {
        const u = await this.db.getDb().query.users.findFirst({ where: eq(users.id, m.userId) });
        if (!u) return null;
        return {
          id: u.id,
          nickname: u.nickname,
          email: u.email,
          avatarUrl: u.avatarUrl,
          publicKey: u.publicKey,
          role: m.role,
          isOnline: await this.redis.isUserOnline(u.id),
          lastSeen: await this.redis.getUserLastSeen(u.id),
        };
      }),
    );

    // Get last message
    const lastMsg = await this.db.getDb().query.messages.findFirst({
      where: eq(messages.chatId, chatId),
      orderBy: [desc(messages.createdAt)],
    });

    let displayName = chat.groupName;
    let displayAvatar = chat.groupAvatar;

    if (!chat.isGroup) {
      const other = memberUsers.find((m) => m?.id !== currentUserId);
      displayName = other?.nickname;
      displayAvatar = other?.avatarUrl;
    }

    return {
      id: chat.id,
      isGroup: chat.isGroup,
      name: displayName,
      avatar: displayAvatar,
      members: memberUsers.filter(Boolean),
      lastMessage: lastMsg,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }

  // ─── Add Member to Group ──────────────────────────────────────────────────
  async addMember(chatId: string, adminId: string, newMemberId: string) {
    await this.ensureAdmin(chatId, adminId);
    await this.db.getDb().insert(chatMembers).values({ chatId, userId: newMemberId, role: 'member' });
    return { message: 'Member added' };
  }

  // ─── Remove Member ────────────────────────────────────────────────────────
  async removeMember(chatId: string, adminId: string, memberId: string) {
    await this.ensureAdmin(chatId, adminId);
    await this.db.getDb().delete(chatMembers).where(
      and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, memberId)),
    );
    return { message: 'Member removed' };
  }

  // ─── Leave Group ──────────────────────────────────────────────────────────
  async leaveGroup(chatId: string, userId: string) {
    await this.db.getDb().delete(chatMembers).where(
      and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)),
    );
    return { message: 'Left group' };
  }

  // ─── Update Group ─────────────────────────────────────────────────────────
  async updateGroup(chatId: string, adminId: string, data: { name?: string }, avatarFile?: Express.Multer.File) {
    await this.ensureAdmin(chatId, adminId);
    const update: any = {};
    if (data.name) update.groupName = data.name;
    if (avatarFile) {
      update.groupAvatar = await this.supabase.uploadGroupAvatar(chatId, avatarFile);
    }
    await this.db.getDb().update(chats).set(update).where(eq(chats.id, chatId));
    return { message: 'Group updated' };
  }

  // ─── Check if user is member ──────────────────────────────────────────────
  async isMember(chatId: string, userId: string): Promise<boolean> {
    const m = await this.db.getDb().query.chatMembers.findFirst({
      where: and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)),
    });
    return !!m;
  }

  private async ensureAdmin(chatId: string, userId: string) {
    const m = await this.db.getDb().query.chatMembers.findFirst({
      where: and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)),
    });
    if (!m || m.role !== 'admin') throw new ForbiddenException('Admin only');
  }
}
