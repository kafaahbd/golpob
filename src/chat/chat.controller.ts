import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards,
  UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get()
  getMyChats(@CurrentUser() user: any) {
    return this.chatService.getUserChats(user.id);
  }

  @Post('dm/:targetId')
  getOrCreateDm(@CurrentUser() user: any, @Param('targetId') targetId: string) {
    return this.chatService.getOrCreateDm(user.id, targetId);
  }

  @Post('group')
  @UseInterceptors(FileInterceptor('avatar'))
  createGroup(
    @CurrentUser() user: any,
    @Body() body: { name: string; memberIds: string[] },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds : [body.memberIds];
    return this.chatService.createGroup(user.id, body.name, memberIds, file);
  }

  @Get(':id')
  getChatDetails(@Param('id') id: string, @CurrentUser() user: any) {
    return this.chatService.getChatDetails(id, user.id);
  }

  @Post(':id/members/:userId')
  addMember(@Param('id') id: string, @CurrentUser() user: any, @Param('userId') userId: string) {
    return this.chatService.addMember(id, user.id, userId);
  }

  @Delete(':id/members/:userId')
  removeMember(@Param('id') id: string, @CurrentUser() user: any, @Param('userId') userId: string) {
    return this.chatService.removeMember(id, user.id, userId);
  }

  @Delete(':id/leave')
  leaveGroup(@Param('id') id: string, @CurrentUser() user: any) {
    return this.chatService.leaveGroup(id, user.id);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('avatar'))
  updateGroup(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { name?: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.chatService.updateGroup(id, user.id, body, file);
  }
}
