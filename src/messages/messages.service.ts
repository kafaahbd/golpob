import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { SupabaseService } from '../common/supabase.service';
import { ChatService } from '../chat/chat.service';
import { messages, messageStatuses, reactions, chatMembers, users } from '../common/schema';
import { eq, and, desc, asc, lt, gt , sql } from 'drizzle-orm';

@Injectable()
export class MessagesService {
  constructor(
    private db: DatabaseService,
    private supabase: SupabaseService,
    private chatService: ChatService,
  ) {}

  async sendMessage(dto: {
    chatId: string;
    senderId: string;
    encryptedContent: string;
    type: 'text' | 'image' | 'voice';
    replyToId?: string;
    mediaUrl?: string;
    mediaMeta?: string;
  }) {
    const isMember = await this.chatService.isMember(dto.chatId, dto.senderId);
    if (!isMember) throw new ForbiddenException('Not a member of this chat');

    const [msg] = await this.db.getDb().insert(messages).values({
      chatId: dto.chatId,
      senderId: dto.senderId,
      encryptedContent: dto.encryptedContent,
      type: dto.type,
      replyToId: dto.replyToId,
      mediaUrl: dto.mediaUrl,
      mediaMeta: dto.mediaMeta,
    }).returning();

    // Update chat updatedAt
    await this.db.getDb().execute(
  sql`UPDATE chats SET updated_at = NOW() WHERE id = ${dto.chatId}`
);

    // Create delivery status records for all members except sender
    const members = await this.db.getDb().query.chatMembers.findMany({
      where: eq(chatMembers.chatId, dto.chatId),
    });

    const statusRecords = members
      .filter((m) => m.userId !== dto.senderId)
      .map((m) => ({ messageId: msg.id, userId: m.userId }));

    if (statusRecords.length > 0) {
      await this.db.getDb().insert(messageStatuses).values(statusRecords);
    }

    return this.enrichMessage(msg);
  }

  async uploadMedia(chatId: string, senderId: string, file: Express.Multer.File) {
    const isMember = await this.chatService.isMember(chatId, senderId);
    if (!isMember) throw new ForbiddenException('Not a member');

    let url: string;
    if (file.mimetype.startsWith('image/')) {
      url = await this.supabase.uploadImage(chatId, file);
    } else {
      url = await this.supabase.uploadVoice(chatId, file.buffer);
    }
    return { url };
  }

  async getMessages(chatId: string, userId: string, cursor?: string, limit = 40) {
    const isMember = await this.chatService.isMember(chatId, userId);
    if (!isMember) throw new ForbiddenException('Not a member');

    const where = cursor
      ? and(eq(messages.chatId, chatId), lt(messages.createdAt, new Date(cursor)))
      : eq(messages.chatId, chatId);

    const msgs = await this.db.getDb().query.messages.findMany({
      where,
      orderBy: [desc(messages.createdAt)],
      limit,
    });

    const enriched = await Promise.all(msgs.map((m) => this.enrichMessage(m)));
    return enriched.reverse();
  }

  async markDelivered(messageId: string, userId: string) {
    await this.db.getDb()
      .update(messageStatuses)
      .set({ delivered: true, deliveredAt: new Date() })
      .where(and(eq(messageStatuses.messageId, messageId), eq(messageStatuses.userId, userId)));
  }

  async markSeen(chatId: string, userId: string) {
    // Mark all unseen messages in this chat as seen
    const unread = await this.db.getDb().query.messageStatuses.findMany({
      where: and(eq(messageStatuses.userId, userId)),
    });

    const msgIds = (await this.db.getDb().query.messages.findMany({
      where: eq(messages.chatId, chatId),
    })).map((m) => m.id);

    for (const id of msgIds) {
      await this.db.getDb()
        .update(messageStatuses)
        .set({ seen: true, seenAt: new Date() })
        .where(and(eq(messageStatuses.messageId, id), eq(messageStatuses.userId, userId)));
    }
  }

  async getMessageStatus(messageId: string) {
    const statuses = await this.db.getDb().query.messageStatuses.findMany({
      where: eq(messageStatuses.messageId, messageId),
    });
    const allDelivered = statuses.every((s) => s.delivered);
    const allSeen = statuses.every((s) => s.seen);
    return {
      status: allSeen ? 'seen' : allDelivered ? 'delivered' : 'sent',
      statuses,
    };
  }

  async deleteMessage(messageId: string, userId: string, forEveryone = false) {
    const msg = await this.db.getDb().query.messages.findFirst({
      where: eq(messages.id, messageId),
    });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== userId) throw new ForbiddenException('Not your message');

    if (forEveryone) {
      await this.db.getDb().update(messages).set({
        deletedForEveryone: true,
        encryptedContent: '',
        isDeleted: true,
      }).where(eq(messages.id, messageId));
    } else {
      await this.db.getDb().update(messages).set({ isDeleted: true })
        .where(eq(messages.id, messageId));
    }

    return { messageId, forEveryone };
  }

  async addReaction(messageId: string, userId: string, reactionType: string) {
    // Upsert reaction
    const existing = await this.db.getDb().query.reactions.findFirst({
      where: and(eq(reactions.messageId, messageId), eq(reactions.userId, userId)),
    });

    if (existing) {
      await this.db.getDb().update(reactions).set({ reactionType })
        .where(and(eq(reactions.messageId, messageId), eq(reactions.userId, userId)));
    } else {
      await this.db.getDb().insert(reactions).values({ messageId, userId, reactionType });
    }

    return this.getReactions(messageId);
  }

  async removeReaction(messageId: string, userId: string) {
    await this.db.getDb().delete(reactions).where(
      and(eq(reactions.messageId, messageId), eq(reactions.userId, userId)),
    );
    return this.getReactions(messageId);
  }

  async getReactions(messageId: string) {
    return this.db.getDb().query.reactions.findMany({
      where: eq(reactions.messageId, messageId),
    });
  }

  private async enrichMessage(msg: any) {
    const sender = await this.db.getDb().query.users.findFirst({
      where: eq(users.id, msg.senderId),
    });
    const msgReactions = await this.getReactions(msg.id);
    const status = await this.getMessageStatus(msg.id);

    return {
      ...msg,
      sender: sender ? { id: sender.id, nickname: sender.nickname, avatarUrl: sender.avatarUrl } : null,
      reactions: msgReactions,
      status: status.status,
    };
  }
}
