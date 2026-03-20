import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private callsService: CallsService) {}

  @Get('history')
  getHistory(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.callsService.getCallHistory(user.id, limit ? parseInt(limit) : 30);
  }

  @Get('missed')
  getMissed(@CurrentUser() user: any) {
    return this.callsService.getMissedCalls(user.id);
  }

  @Post('log')
  logCall(
    @CurrentUser() user: any,
    @Body() body: {
      receiverId: string;
      type: 'audio' | 'video';
      status: 'missed' | 'accepted' | 'rejected';
      durationSeconds?: number;
    },
  ) {
    return this.callsService.logCall({ ...body, callerId: user.id });
  }
}
