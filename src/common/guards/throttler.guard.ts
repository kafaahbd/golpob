import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(): Promise<void> {
    throw new HttpException(
      { message: 'Too many requests. Please slow down.', statusCode: 429 },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use IP + user ID if authenticated, otherwise just IP
    const userId = req.user?.id || '';
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    return `${ip}-${userId}`;
  }
}
