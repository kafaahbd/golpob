import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { RedisService } from '../common/redis.service';

@Module({
  providers: [NotificationService, RedisService],
  exports: [NotificationService],
})
export class NotificationModule {}
