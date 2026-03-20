import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { otpCodes } from '../common/schema';
import { eq, and, gt } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class OtpService {
  constructor(private db: DatabaseService) {}

  generate(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  async save(email: string, code: string): Promise<void> {
    const otpHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Delete old OTPs for this email
    await this.db.getDb().delete(otpCodes).where(eq(otpCodes.email, email));

    await this.db.getDb().insert(otpCodes).values({ email, otpHash, expiresAt });
  }

  async verify(email: string, code: string): Promise<boolean> {
    const record = await this.db.getDb().query.otpCodes.findFirst({
      where: and(eq(otpCodes.email, email), gt(otpCodes.expiresAt, new Date())),
    });

    if (!record) return false;
    return bcrypt.compare(code, record.otpHash);
  }

  async invalidate(email: string): Promise<void> {
    await this.db.getDb().delete(otpCodes).where(eq(otpCodes.email, email));
  }
}
