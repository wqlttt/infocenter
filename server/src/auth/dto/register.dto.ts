import {
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(['leader', 'member'])
  role: 'leader' | 'member';
}
