import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { DatabaseService } from '../common/database.service';
import { RedisService } from '../common/redis.service';
import { SupabaseService } from '../common/supabase.service';
import { ChatService } from '../chat/chat.service';
import { UsersService } from '../users/users.service';
import { NotificationService } from '../notifications/notification.service';

@Module({
  controllers: [MessagesController],
  providers: [
    MessagesService, DatabaseService, RedisService, SupabaseService,
    ChatService, UsersService, NotificationService,
  ],
  exports: [MessagesService],
})
export class MessagesModule {}
