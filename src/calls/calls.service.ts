import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { calls, users } from '../common/schema';
import { eq, or, desc } from 'drizzle-orm';

@Injectable()
export class CallsService {
  constructor(private db: DatabaseService) {}

  async logCall(data: {
    callerId: string;
    receiverId: string;
    type: 'audio' | 'video';
    status: 'missed' | 'accepted' | 'rejected';
    durationSeconds?: number;
  }) {
    const [call] = await this.db.getDb().insert(calls).values({
      callerId: data.callerId,
      receiverId: data.receiverId,
      type: data.type,
      status: data.status,
      durationSeconds: data.durationSeconds,
      startedAt: data.status === 'accepted' ? new Date() : undefined,
      endedAt: data.status === 'accepted' ? new Date() : undefined,
    }).returning();
    return call;
  }

  async getCallHistory(userId: string, limit = 30) {
    const history = await this.db.getDb().query.calls.findMany({
      where: or(eq(calls.callerId, userId), eq(calls.receiverId, userId)),
      orderBy: [desc(calls.createdAt)],
      limit,
    });

    return Promise.all(
      history.map(async (call) => {
        const caller = await this.db.getDb().query.users.findFirst({
          where: eq(users.id, call.callerId),
        });
        const receiver = await this.db.getDb().query.users.findFirst({
          where: eq(users.id, call.receiverId),
        });
        return {
          ...call,
          caller: caller ? { id: caller.id, nickname: caller.nickname, avatarUrl: caller.avatarUrl } : null,
          receiver: receiver ? { id: receiver.id, nickname: receiver.nickname, avatarUrl: receiver.avatarUrl } : null,
          isOutgoing: call.callerId === userId,
        };
      }),
    );
  }

  async getMissedCalls(userId: string) {
    return this.db.getDb().query.calls.findMany({
      where: eq(calls.receiverId, userId),
      orderBy: [desc(calls.createdAt)],
      limit: 20,
    });
  }
}
