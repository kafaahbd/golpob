import {
  Controller, Get, Patch, Post, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: any) {
    return this.usersService.findById(user.id);
  }

  @Get('search')
  search(@Query('q') query: string, @CurrentUser() user: any) {
    return this.usersService.searchUsers(query, user.id);
  }

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: any,
    @Body() body: { nickname?: string; phone?: string; publicKey?: string },
  ) {
    return this.usersService.updateProfile(user.id, body);
  }

  @Patch('me/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  updateAvatar(
    @CurrentUser() user: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /image\/(jpeg|png|webp)/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.usersService.updateAvatar(user.id, file);
  }

  @Patch('me/fcm-token')
  updateFcmToken(@CurrentUser() user: any, @Body('token') token: string) {
    return this.usersService.updateFcmToken(user.id, token);
  }

  @Post('block/:id')
  blockUser(@CurrentUser() user: any, @Param('id') blockedId: string) {
    return this.usersService.blockUser(user.id, blockedId);
  }

  @Delete('block/:id')
  unblockUser(@CurrentUser() user: any, @Param('id') blockedId: string) {
    return this.usersService.unblockUser(user.id, blockedId);
  }

  @Get('me/blocked')
  getBlocked(@CurrentUser() user: any) {
    return this.usersService.getBlockedUsers(user.id);
  }

  @Post('me/pin/:chatId')
  pinChat(@CurrentUser() user: any, @Param('chatId') chatId: string) {
    return this.usersService.pinChat(user.id, chatId);
  }

  @Delete('me/pin/:chatId')
  unpinChat(@CurrentUser() user: any, @Param('chatId') chatId: string) {
    return this.usersService.unpinChat(user.id, chatId);
  }

  @Post('me/archive/:chatId')
  archiveChat(@CurrentUser() user: any, @Param('chatId') chatId: string) {
    return this.usersService.archiveChat(user.id, chatId);
  }

  @Delete('me/archive/:chatId')
  unarchiveChat(@CurrentUser() user: any, @Param('chatId') chatId: string) {
    return this.usersService.unarchiveChat(user.id, chatId);
  }
}
