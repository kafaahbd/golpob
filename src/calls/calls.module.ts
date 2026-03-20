import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { DatabaseService } from '../common/database.service';
import { RedisService } from '../common/redis.service';

@Module({
  controllers: [CallsController],
  providers: [CallsService, DatabaseService, RedisService],
  exports: [CallsService],
})
export class CallsModule {}
