import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(2000)
  content: string;

  @IsOptional()
  @IsString()
  linkUrl?: string;

  @IsString()
  sendMessageType: string; // '站内信' | '邮件' | '短信'

  @IsArray()
  receiverIds: string[]; // 收件人 userId 列表
}
