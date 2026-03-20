import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../common/redis.service';
import { MessagesService } from '../messages/messages.service';
import { NotificationService } from '../notifications/notification.service';
import { DatabaseService } from '../common/database.service';
import { users, chatMembers } from '../common/schema';
import { eq } from 'drizzle-orm';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/',
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private userSocketMap = new Map<string, string>(); // userId -> socketId
  private socketUserMap = new Map<string, string>(); // socketId -> userId

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    private redis: RedisService,
    private messagesService: MessagesService,
    private notificationService: NotificationService,
    private db: DatabaseService,
  ) {}

  // ─── Connection ───────────────────────────────────────────────────────────
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) { client.disconnect(); return; }

      const payload = this.jwt.verify(token, { secret: this.config.get('JWT_SECRET') });
      const userId = payload.sub;

      client.data.userId = userId;
      this.userSocketMap.set(userId, client.id);
      this.socketUserMap.set(client.id, userId);

      await this.redis.setUserOnline(userId, client.id);

      // Join all user's chat rooms
      const memberships = await this.db.getDb().query.chatMembers.findMany({
        where: eq(chatMembers.userId, userId),
      });
      memberships.forEach((m) => client.join(`chat:${m.chatId}`));

      // Notify others of online status
      this.server.emit('user:online', { userId });
      this.logger.log(`User ${userId} connected (${client.id})`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.userId || this.socketUserMap.get(client.id);
    if (!userId) return;

    this.userSocketMap.delete(userId);
    this.socketUserMap.delete(client.id);
    await this.redis.setUserOffline(userId);

    // Update lastSeen in DB
    await this.db.getDb().update(users).set({ lastSeen: new Date(), isOnline: false }).where(eq(users.id, userId));

    this.server.emit('user:offline', { userId, lastSeen: new Date().toISOString() });
    this.logger.log(`User ${userId} disconnected`);
  }

  // ─── Send Message ─────────────────────────────────────────────────────────
  @SubscribeMessage('message:send')
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() data: {
    chatId: string;
    encryptedContent: string;
    type: 'text' | 'image' | 'voice';
    replyToId?: string;
    mediaUrl?: string;
    mediaMeta?: string;
    tempId?: string;
  }) {
    const userId = client.data.userId;
    if (!userId) return;

    try {
      const msg = await this.messagesService.sendMessage({
        chatId: data.chatId,
        senderId: userId,
        encryptedContent: data.encryptedContent,
        type: data.type,
        replyToId: data.replyToId,
        mediaUrl: data.mediaUrl,
        mediaMeta: data.mediaMeta,
      });

      // Emit to all chat members
      this.server.to(`chat:${data.chatId}`).emit('message:receive', {
        ...msg,
        tempId: data.tempId,
      });

      // Send push notifications to offline members
      const members = await this.db.getDb().query.chatMembers.findMany({
        where: eq(chatMembers.chatId, data.chatId),
      });

      for (const member of members) {
        if (member.userId === userId) continue;
        const isOnline = await this.redis.isUserOnline(member.userId);
        if (!isOnline) {
          const sender = await this.db.getDb().query.users.findFirst({ where: eq(users.id, userId) });
          const preview = data.type === 'text' ? '🔒 Encrypted message' : `📎 ${data.type}`;
          await this.notificationService.sendNewMessageNotification(member.userId, sender?.nickname || 'Someone', preview);
        }
      }
    } catch (err) {
      client.emit('error', { message: err.message });
    }
  }

  // ─── Typing ───────────────────────────────────────────────────────────────
  @SubscribeMessage('typing:start')
  async handleTypingStart(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }) {
    const userId = client.data.userId;
    await this.redis.setTyping(data.chatId, userId);
    client.to(`chat:${data.chatId}`).emit('typing:start', { userId, chatId: data.chatId });
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }) {
    const userId = client.data.userId;
    await this.redis.clearTyping(data.chatId, userId);
    client.to(`chat:${data.chatId}`).emit('typing:stop', { userId, chatId: data.chatId });
  }

  // ─── Message Status ───────────────────────────────────────────────────────
  @SubscribeMessage('message:delivered')
  async handleDelivered(@ConnectedSocket() client: Socket, @MessageBody() data: { messageId: string }) {
    const userId = client.data.userId;
    await this.messagesService.markDelivered(data.messageId, userId);
    // Notify sender
    const msg = await this.db.getDb().query.messages.findFirst({ where: (messages, { eq }) => eq(messages.id, data.messageId) });
    if (msg) {
      const senderSocket = this.userSocketMap.get(msg.senderId);
      if (senderSocket) {
        this.server.to(senderSocket).emit('message:status', { messageId: data.messageId, status: 'delivered' });
      }
    }
  }

  @SubscribeMessage('message:seen')
  async handleSeen(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }) {
    const userId = client.data.userId;
    await this.messagesService.markSeen(data.chatId, userId);
    client.to(`chat:${data.chatId}`).emit('message:seen', { userId, chatId: data.chatId });
  }

  // ─── Reactions ────────────────────────────────────────────────────────────
  @SubscribeMessage('reaction:add')
  async handleReaction(@ConnectedSocket() client: Socket, @MessageBody() data: { messageId: string; reaction: string; chatId: string }) {
    const userId = client.data.userId;
    const updated = await this.messagesService.addReaction(data.messageId, userId, data.reaction);
    this.server.to(`chat:${data.chatId}`).emit('reaction:updated', { messageId: data.messageId, reactions: updated });
  }

  @SubscribeMessage('reaction:remove')
  async handleReactionRemove(@ConnectedSocket() client: Socket, @MessageBody() data: { messageId: string; chatId: string }) {
    const userId = client.data.userId;
    const updated = await this.messagesService.removeReaction(data.messageId, userId);
    this.server.to(`chat:${data.chatId}`).emit('reaction:updated', { messageId: data.messageId, reactions: updated });
  }

  // ─── Message Delete ───────────────────────────────────────────────────────
  @SubscribeMessage('message:delete')
  async handleDelete(@ConnectedSocket() client: Socket, @MessageBody() data: { messageId: string; chatId: string; forEveryone: boolean }) {
    const userId = client.data.userId;
    const result = await this.messagesService.deleteMessage(data.messageId, userId, data.forEveryone);
    if (data.forEveryone) {
      this.server.to(`chat:${data.chatId}`).emit('message:deleted', result);
    } else {
      client.emit('message:deleted', result);
    }
  }

  // ─── WebRTC Calls ─────────────────────────────────────────────────────────
  @SubscribeMessage('call:start')
  async handleCallStart(@ConnectedSocket() client: Socket, @MessageBody() data: {
    targetUserId: string; callType: 'audio' | 'video'; callId: string;
  }) {
    const callerId = client.data.userId;
    const caller = await this.db.getDb().query.users.findFirst({ where: eq(users.id, callerId) });
    const targetSocket = this.userSocketMap.get(data.targetUserId);

    if (targetSocket) {
      this.server.to(targetSocket).emit('call:incoming', {
        callId: data.callId,
        callerId,
        callerName: caller?.nickname,
        callerAvatar: caller?.avatarUrl,
        callType: data.callType,
      });
    } else {
      await this.notificationService.sendCallNotification(data.targetUserId, caller?.nickname || 'Someone', data.callType, data.callId);
      client.emit('call:unavailable', { targetUserId: data.targetUserId });
    }
  }

  @SubscribeMessage('call:accept')
  handleCallAccept(@ConnectedSocket() client: Socket, @MessageBody() data: { callId: string; callerId: string }) {
    const callerSocket = this.userSocketMap.get(data.callerId);
    if (callerSocket) {
      this.server.to(callerSocket).emit('call:accepted', { callId: data.callId, accepterId: client.data.userId });
    }
  }

  @SubscribeMessage('call:reject')
  handleCallReject(@ConnectedSocket() client: Socket, @MessageBody() data: { callId: string; callerId: string }) {
    const callerSocket = this.userSocketMap.get(data.callerId);
    if (callerSocket) {
      this.server.to(callerSocket).emit('call:rejected', { callId: data.callId });
    }
  }

  @SubscribeMessage('call:end')
  handleCallEnd(@ConnectedSocket() client: Socket, @MessageBody() data: { callId: string; targetUserId: string }) {
    const targetSocket = this.userSocketMap.get(data.targetUserId);
    if (targetSocket) {
      this.server.to(targetSocket).emit('call:ended', { callId: data.callId });
    }
  }

  @SubscribeMessage('call:offer')
  handleCallOffer(@ConnectedSocket() client: Socket, @MessageBody() data: { targetUserId: string; offer: any; callId: string }) {
    const targetSocket = this.userSocketMap.get(data.targetUserId);
    if (targetSocket) {
      this.server.to(targetSocket).emit('call:offer', { offer: data.offer, callId: data.callId, callerId: client.data.userId });
    }
  }

  @SubscribeMessage('call:answer')
  handleCallAnswer(@ConnectedSocket() client: Socket, @MessageBody() data: { callerId: string; answer: any; callId: string }) {
    const callerSocket = this.userSocketMap.get(data.callerId);
    if (callerSocket) {
      this.server.to(callerSocket).emit('call:answer', { answer: data.answer, callId: data.callId });
    }
  }

  @SubscribeMessage('call:ice-candidate')
  handleIceCandidate(@ConnectedSocket() client: Socket, @MessageBody() data: { targetUserId: string; candidate: any; callId: string }) {
    const targetSocket = this.userSocketMap.get(data.targetUserId);
    if (targetSocket) {
      this.server.to(targetSocket).emit('call:ice-candidate', { candidate: data.candidate, callId: data.callId, from: client.data.userId });
    }
  }

  // ─── Join Chat Room ────────────────────────────────────────────────────────
  @SubscribeMessage('chat:join')
  handleJoinChat(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }) {
    client.join(`chat:${data.chatId}`);
  }

  @SubscribeMessage('chat:leave')
  handleLeaveChat(@ConnectedSocket() client: Socket, @MessageBody() data: { chatId: string }) {
    client.leave(`chat:${data.chatId}`);
  }
}
