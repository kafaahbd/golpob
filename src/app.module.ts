import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChatModule } from './chat/chat.module';
import { MessagesModule } from './messages/messages.module';
import { NotificationModule } from './notifications/notification.module';
import { CallsModule } from './calls/calls.module';
import { DatabaseService } from './common/database.service';
import { RedisService } from './common/redis.service';
import { SupabaseService } from './common/supabase.service';
import { ChatGateway } from './chat/chat.gateway';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MessagesService } from './messages/messages.service';
import { NotificationService } from './notifications/notification.service';
import { ChatService } from './chat/chat.service';
import { UsersService } from './users/users.service';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    MulterModule.register({ limits: { fileSize: 5 * 1024 * 1024 } }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '7d') },
      }),
    }),
    AuthModule,
    UsersModule,
    ChatModule,
    MessagesModule,
    NotificationModule,
    CallsModule,
  ],
  controllers: [AppController],
  providers: [
    DatabaseService,
    RedisService,
    SupabaseService,
    ChatGateway,
    MessagesService,
    NotificationService,
    ChatService,
    UsersService,
  ],
})
export class AppModule {}
