import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      app: 'Golpo by Kafaah',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
