import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { DatabaseService } from '../common/database.service';
import { RedisService } from '../common/redis.service';
import { SupabaseService } from '../common/supabase.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, DatabaseService, RedisService, SupabaseService],
  exports: [UsersService],
})
export class UsersModule {}
