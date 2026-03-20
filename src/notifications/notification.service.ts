import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { RedisService } from '../common/redis.service';

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private initialized = false;

  constructor(private config: ConfigService, private redis: RedisService) {}

  onModuleInit() {
    try {
      const projectId = this.config.get('FIREBASE_PROJECT_ID');
      const privateKey = this.config.get('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
      const clientEmail = this.config.get('FIREBASE_CLIENT_EMAIL');

      if (projectId && privateKey && clientEmail) {
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert({ projectId, privateKey, clientEmail }),
          });
        }
        this.initialized = true;
        this.logger.log('✅ Firebase Admin initialized');
      } else {
        this.logger.warn('⚠️ Firebase not configured - notifications disabled');
      }
    } catch (err) {
      this.logger.error('Firebase init failed:', err);
    }
  }

  async sendNewMessageNotification(recipientId: string, senderNickname: string, preview: string) {
    if (!this.initialized) return;
    const token = await this.redis.getFcmToken(recipientId);
    if (!token) return;

    try {
      await admin.messaging().send({
        token,
        notification: { title: senderNickname, body: preview },
        data: { type: 'new_message', senderId: recipientId },
        android: { priority: 'high', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
    } catch (err) {
      this.logger.error(`FCM send failed for user ${recipientId}:`, err);
    }
  }

  async sendCallNotification(recipientId: string, callerNickname: string, callType: string, callId: string) {
    if (!this.initialized) return;
    const token = await this.redis.getFcmToken(recipientId);
    if (!token) return;

    try {
      await admin.messaging().send({
        token,
        notification: { title: `Incoming ${callType} call`, body: `${callerNickname} is calling...` },
        data: { type: 'incoming_call', callId, callType, callerNickname },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
    } catch (err) {
      this.logger.error(`Call FCM failed for user ${recipientId}:`, err);
    }
  }
}
