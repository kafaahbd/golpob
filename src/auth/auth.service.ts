import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../common/database.service';
import { OtpService } from './otp.service';
import { EmailService } from './email.service';
import { RedisService } from '../common/redis.service';
import { users } from '../common/schema';
import { eq } from 'drizzle-orm';
import { SignupDto, VerifyOtpDto, ResendOtpDto, ChangePasswordDto } from './dto/signup.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private db: DatabaseService,
    private jwt: JwtService,
    private otp: OtpService,
    private email: EmailService,
    private redis: RedisService,
  ) {}

  // ─── Signup ───────────────────────────────────────────────────────────────
  async signup(dto: SignupDto) {
    const existing = await this.db.getDb().query.users.findFirst({
      where: eq(users.email, dto.email),
    });

    if (existing?.verified) {
      throw new ConflictException('Email already registered. Please login.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    if (!existing) {
      await this.db.getDb().insert(users).values({
        email: dto.email,
        phone: dto.phone,
        nickname: dto.nickname,
        passwordHash,
      });
    } else {
      // Update password if account exists but unverified
      await this.db.getDb()
        .update(users)
        .set({ passwordHash, nickname: dto.nickname, phone: dto.phone })
        .where(eq(users.email, dto.email));
    }

    await this.sendOtp(dto.email);
    return { message: 'OTP sent to your email. Please verify.' };
  }

  // ─── Login ────────────────────────────────────────────────────────────────
  async login(email: string, password: string) {
    const user = await this.db.getDb().query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Account setup incomplete. Please sign up again.');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.verified) {
      // Re-send OTP for unverified accounts
      await this.sendOtp(email);
      return { requiresVerification: true, message: 'Please verify your email first. OTP sent.' };
    }

    // Verified + correct password → issue JWT directly
    const token = this.jwt.sign({ sub: user.id, email: user.email });
    return {
      token,
      user: this.sanitizeUser(user),
    };
  }

  // ─── Send OTP (internal) ──────────────────────────────────────────────────
  private async sendOtp(email: string) {
    const cooldown = await this.redis.getOtpCooldown(email);
    if (cooldown > 0) {
      throw new BadRequestException(`Please wait ${cooldown}s before requesting another OTP`);
    }

    const resendCount = await this.redis.getOtpResendCount(email);
    if (resendCount >= 5) {
      throw new BadRequestException('Too many OTP requests. Try again in 1 hour.');
    }

    const code = this.otp.generate();
    await this.otp.save(email, code);
    await this.redis.setOtpCooldown(email, 60);
    await this.redis.incrementOtpResendCount(email);
    await this.email.sendOtp(email, code);
  }

  // ─── Verify OTP ───────────────────────────────────────────────────────────
  async verifyOtp(dto: VerifyOtpDto) {
    const valid = await this.otp.verify(dto.email, dto.code);
    if (!valid) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const [user] = await this.db.getDb()
      .update(users)
      .set({ verified: true })
      .where(eq(users.email, dto.email))
      .returning();

    if (!user) throw new NotFoundException('User not found');

    await this.otp.invalidate(dto.email);

    const token = this.jwt.sign({ sub: user.id, email: user.email });
    return { token, user: this.sanitizeUser(user) };
  }

  // ─── Resend OTP ───────────────────────────────────────────────────────────
  async resendOtp(dto: ResendOtpDto) {
    const user = await this.db.getDb().query.users.findFirst({
      where: eq(users.email, dto.email),
    });
    if (!user) throw new NotFoundException('No account found');

    await this.sendOtp(dto.email);
    return { message: 'New OTP sent.' };
  }

  // ─── Change Password ──────────────────────────────────────────────────────
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.db.getDb().query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new NotFoundException('User not found');

    if (!user.passwordHash) {
      throw new BadRequestException('No password set on this account');
    }

    const currentValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!currentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.db.getDb()
      .update(users)
      .set({ passwordHash: newHash })
      .where(eq(users.id, userId));

    return { message: 'Password changed successfully' };
  }

  // ─── Validate User (JWT Strategy) ────────────────────────────────────────
  async validateUser(userId: string) {
    return this.db.getDb().query.users.findFirst({
      where: eq(users.id, userId),
    });
  }

  private sanitizeUser(user: any) {
    const { passwordHash, fcmToken, ...rest } = user;
    return rest;
  }
}
