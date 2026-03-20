import {
  Controller, Get, Post, Delete, Param, Body, Query, UseGuards,
  UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @Get(':chatId')
  getMessages(
    @Param('chatId') chatId: string,
    @CurrentUser() user: any,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagesService.getMessages(chatId, user.id, cursor, limit ? parseInt(limit) : 40);
  }

  @Post()
  sendMessage(
    @CurrentUser() user: any,
    @Body() body: {
      chatId: string;
      encryptedContent: string;
      type: 'text' | 'image' | 'voice';
      replyToId?: string;
      mediaUrl?: string;
      mediaMeta?: string;
    },
  ) {
    return this.messagesService.sendMessage({ ...body, senderId: user.id });
  }

  @Post('upload/:chatId')
  @UseInterceptors(FileInterceptor('file'))
  uploadMedia(
    @Param('chatId') chatId: string,
    @CurrentUser() user: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.messagesService.uploadMedia(chatId, user.id, file);
  }

  @Post('seen/:chatId')
  markSeen(@Param('chatId') chatId: string, @CurrentUser() user: any) {
    return this.messagesService.markSeen(chatId, user.id);
  }

  @Delete(':id')
  deleteMessage(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('forEveryone') forEveryone?: string,
  ) {
    return this.messagesService.deleteMessage(id, user.id, forEveryone === 'true');
  }

  @Post(':id/reactions')
  addReaction(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('reaction') reaction: string,
  ) {
    return this.messagesService.addReaction(id, user.id, reaction);
  }

  @Delete(':id/reactions')
  removeReaction(@Param('id') id: string, @CurrentUser() user: any) {
    return this.messagesService.removeReaction(id, user.id);
  }
}
