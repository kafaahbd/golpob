import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { DatabaseService } from '../common/database.service';
import { RedisService } from '../common/redis.service';
import { SupabaseService } from '../common/supabase.service';
import { UsersService } from '../users/users.service';

@Module({
  controllers: [ChatController],
  providers: [ChatService, DatabaseService, RedisService, SupabaseService, UsersService],
  exports: [ChatService],
})
export class ChatModule {}
