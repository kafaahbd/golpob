import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    this.client = new Redis(redisUrl, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
    });

    this.client.on('connect', () => this.logger.log('✅ Redis connected'));
    this.client.on('error', (err) => this.logger.error('Redis error:', err));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // ─── Online Presence ───────────────────────────────────
  async setUserOnline(userId: string, socketId: string): Promise<void> {
    await this.client.setex(`online:${userId}`, 120, socketId);
    await this.client.sadd('online_users', userId);
  }

  async setUserOffline(userId: string): Promise<void> {
    await this.client.del(`online:${userId}`);
    await this.client.srem('online_users', userId);
    await this.client.set(`last_seen:${userId}`, Date.now().toString());
  }

  async isUserOnline(userId: string): Promise<boolean> {
    return (await this.client.exists(`online:${userId}`)) === 1;
  }

  async getOnlineUsers(): Promise<string[]> {
    return this.client.smembers('online_users');
  }

  async getUserSocketId(userId: string): Promise<string | null> {
    return this.client.get(`online:${userId}`);
  }

  async getUserLastSeen(userId: string): Promise<number | null> {
    const val = await this.client.get(`last_seen:${userId}`);
    return val ? parseInt(val) : null;
  }

  // ─── Typing Indicators ────────────────────────────────
  async setTyping(chatId: string, userId: string): Promise<void> {
    await this.client.setex(`typing:${chatId}:${userId}`, 5, '1');
  }

  async clearTyping(chatId: string, userId: string): Promise<void> {
    await this.client.del(`typing:${chatId}:${userId}`);
  }

  async getTypingUsers(chatId: string, excludeUserId: string): Promise<string[]> {
    const keys = await this.client.keys(`typing:${chatId}:*`);
    return keys
      .map((k) => k.split(':')[2])
      .filter((uid) => uid !== excludeUserId);
  }

  // ─── OTP Rate Limiting ────────────────────────────────
  async getOtpResendCount(email: string): Promise<number> {
    const val = await this.client.get(`otp_resend:${email}`);
    return val ? parseInt(val) : 0;
  }

  async incrementOtpResendCount(email: string): Promise<void> {
    const key = `otp_resend:${email}`;
    const current = await this.client.get(key);
    if (!current) {
      await this.client.setex(key, 3600, '1'); // 1 hour window
    } else {
      await this.client.incr(key);
    }
  }

  async getOtpCooldown(email: string): Promise<number> {
    const ttl = await this.client.ttl(`otp_cooldown:${email}`);
    return ttl > 0 ? ttl : 0;
  }

  async setOtpCooldown(email: string, seconds: number): Promise<void> {
    await this.client.setex(`otp_cooldown:${email}`, seconds, '1');
  }

  // ─── Generic Cache ────────────────────────────────────
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  // ─── Auth Rate Limiting ───────────────────────────────
  async incrementAuthAttempts(ip: string): Promise<number> {
    const key = `auth_attempts:${ip}`;
    const count = await this.client.incr(key);
    if (count === 1) await this.client.expire(key, 900); // 15 min window
    return count;
  }

  async getAuthAttempts(ip: string): Promise<number> {
    const val = await this.client.get(`auth_attempts:${ip}`);
    return val ? parseInt(val) : 0;
  }

  // ─── FCM Token Cache ──────────────────────────────────
  async cacheFcmToken(userId: string, token: string): Promise<void> {
    await this.client.set(`fcm:${userId}`, token);
  }

  async getFcmToken(userId: string): Promise<string | null> {
    return this.client.get(`fcm:${userId}`);
  }
}
