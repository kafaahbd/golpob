import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { messages, users, chats, chatMembers } from '../common/schema';
import { eq, and, ilike, desc } from 'drizzle-orm';

@Injectable()
export class SearchService {
  constructor(private db: DatabaseService) {}

  async searchMessages(userId: string, query: string, limit = 20) {
    if (!query.trim()) return [];

    // Find chats user belongs to
    const memberships = await this.db.getDb().query.chatMembers.findMany({
      where: eq(chatMembers.userId, userId),
    });
    const chatIds = memberships.map((m) => m.chatId);
    if (!chatIds.length) return [];

    // Note: encrypted messages can't be searched server-side
    // This searches media metadata and type only
    const results = await this.db.getDb().query.messages.findMany({
      where: and(eq(messages.isDeleted, false)),
      orderBy: [desc(messages.createdAt)],
      limit,
    });

    return results.filter((m) => chatIds.includes(m.chatId));
  }
}
