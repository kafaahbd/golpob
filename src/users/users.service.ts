import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { RedisService } from '../common/redis.service';
import { SupabaseService } from '../common/supabase.service';
import { users, blocks } from '../common/schema';
import { eq, and, or, ilike, ne } from 'drizzle-orm';

@Injectable()
export class UsersService {
  constructor(
    private db: DatabaseService,
    private redis: RedisService,
    private supabase: SupabaseService,
  ) {}

  async findById(id: string) {
    const user = await this.db.getDb().query.users.findFirst({
      where: eq(users.id, id),
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async findByEmail(email: string) {
    return this.db.getDb().query.users.findFirst({
      where: eq(users.email, email),
    });
  }

  async searchUsers(query: string, currentUserId: string) {
    const results = await this.db.getDb().query.users.findMany({
      where: and(
        or(ilike(users.nickname, `%${query}%`), ilike(users.email, `%${query}%`)),
        ne(users.id, currentUserId),
        eq(users.verified, true),
      ),
      limit: 20,
    });

    return Promise.all(
      results.map(async (u) => ({
        ...this.sanitize(u),
        isOnline: await this.redis.isUserOnline(u.id),
      })),
    );
  }

  async updateProfile(userId: string, data: { nickname?: string; phone?: string; publicKey?: string }) {
    const [updated] = await this.db.getDb()
      .update(users)
      .set({ ...data })
      .where(eq(users.id, userId))
      .returning();
    return this.sanitize(updated);
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    const url = await this.supabase.uploadAvatar(userId, file);
    const [updated] = await this.db.getDb()
      .update(users)
      .set({ avatarUrl: url })
      .where(eq(users.id, userId))
      .returning();
    return this.sanitize(updated);
  }

  async updateFcmToken(userId: string, token: string) {
    await this.db.getDb().update(users).set({ fcmToken: token }).where(eq(users.id, userId));
    await this.redis.cacheFcmToken(userId, token);
  }

  async updatePublicKey(userId: string, publicKey: string) {
    await this.db.getDb().update(users).set({ publicKey }).where(eq(users.id, userId));
  }

  async blockUser(blockerId: string, blockedId: string) {
    const existing = await this.db.getDb().query.blocks.findFirst({
      where: and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)),
    });
    if (existing) throw new ConflictException('User already blocked');
    await this.db.getDb().insert(blocks).values({ blockerId, blockedId });
    return { message: 'User blocked' };
  }

  async unblockUser(blockerId: string, blockedId: string) {
    await this.db.getDb().delete(blocks).where(
      and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)),
    );
    return { message: 'User unblocked' };
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const block = await this.db.getDb().query.blocks.findFirst({
      where: or(
        and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)),
        and(eq(blocks.blockerId, blockedId), eq(blocks.blockedId, blockerId)),
      ),
    });
    return !!block;
  }

  async getBlockedUsers(userId: string) {
    const blockList = await this.db.getDb().query.blocks.findMany({
      where: eq(blocks.blockerId, userId),
    });
    const ids = blockList.map((b) => b.blockedId);
    if (!ids.length) return [];
    const blockedUsers = await Promise.all(ids.map((id) => this.findById(id)));
    return blockedUsers;
  }

  async pinChat(userId: string, chatId: string) {
    const user = await this.db.getDb().query.users.findFirst({ where: eq(users.id, userId) });
    const pinned = new Set(user.pinnedChats || []);
    pinned.add(chatId);
    await this.db.getDb().update(users).set({ pinnedChats: [...pinned] }).where(eq(users.id, userId));
  }

  async unpinChat(userId: string, chatId: string) {
    const user = await this.db.getDb().query.users.findFirst({ where: eq(users.id, userId) });
    const pinned = (user.pinnedChats || []).filter((id) => id !== chatId);
    await this.db.getDb().update(users).set({ pinnedChats: pinned }).where(eq(users.id, userId));
  }

  async archiveChat(userId: string, chatId: string) {
    const user = await this.db.getDb().query.users.findFirst({ where: eq(users.id, userId) });
    const archived = new Set(user.archivedChats || []);
    archived.add(chatId);
    await this.db.getDb().update(users).set({ archivedChats: [...archived] }).where(eq(users.id, userId));
  }

  async unarchiveChat(userId: string, chatId: string) {
    const user = await this.db.getDb().query.users.findFirst({ where: eq(users.id, userId) });
    const archived = (user.archivedChats || []).filter((id) => id !== chatId);
    await this.db.getDb().update(users).set({ archivedChats: archived }).where(eq(users.id, userId));
  }

  private sanitize(user: any) {
    const { fcmToken, ...rest } = user;
    return rest;
  }
}
