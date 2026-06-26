import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthUser } from '../common/types/auth-user.type';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildPayload(user: {
    _id: { toString(): string };
    username: string;
    role: string;
    teamId?: { toString(): string } | null;
  }) {
    return {
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
      teamId: user.teamId?.toString() ?? null,
    };
  }

  private async signTokens(user: {
    _id: { toString(): string };
    username: string;
    role: string;
    teamId?: { toString(): string } | null;
  }) {
    const payload = this.buildPayload(user);
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES', '15m'),
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES', '7d'),
    });
    await this.usersService.updateRefreshToken(
      user._id.toString(),
      this.hashRefreshToken(refreshToken),
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRES', '15m'),
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByUsername(dto.username);
    if (existing) {
      throw new ConflictException('Username already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      username: dto.username,
      passwordHash,
      role: dto.role,
      teamId: null,
    });
    return this.signTokens(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByUsername(dto.username);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== 'active') {
      throw new UnauthorizedException('Account disabled');
    }
    return this.signTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      });
      const user = await this.usersService.findById(payload.sub);
      if (!user?.refreshTokenHash) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const hash = this.hashRefreshToken(refreshToken);
      if (hash !== user.refreshTokenHash) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      return this.signTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshToken(userId, null);
    return { success: true };
  }

  async getProfile(user: AuthUser) {
    const doc = await this.usersService.findById(user.userId);
    if (!doc) {
      throw new BadRequestException('User not found');
    }
    return {
      id: doc._id.toString(),
      username: doc.username,
      role: doc.role,
      teamId: doc.teamId?.toString() ?? null,
    };
  }
}
