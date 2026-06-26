import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// ========== MessageInfo：消息本体，群发场景下只有一份 ==========

export type MessageInfoDocument = HydratedDocument<MessageInfo>;

@Schema({ collection: 'MessageInfo', timestamps: true })
export class MessageInfo {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sendUserId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ default: '' })
  linkUrl: string;

  /** 站内信 / 邮件 / 短信 */
  @Prop({ required: true, enum: ['站内信', '邮件', '短信'] })
  sendMessageType: string;

  @Prop({ required: true })
  sendMessageTime: Date;
}

export const MessageInfoSchema = SchemaFactory.createForClass(MessageInfo);

// ========== UserMessageState：投递状态，每个收件人 × 每条消息 = 一条记录 ==========

export type UserMessageStateDocument = HydratedDocument<UserMessageState>;

@Schema({ collection: 'userMessageStates', timestamps: true })
export class UserMessageState {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'MessageInfo', required: true })
  messageId: Types.ObjectId;

  @Prop({ default: false })
  isRead: boolean;

  /** 软删除：仅对当前用户隐藏，保留行用于溯源 */
  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;
}

export const UserMessageStateSchema = SchemaFactory.createForClass(UserMessageState);

// 关键索引
UserMessageStateSchema.index({ userId: 1, isRead: 1, isDeleted: 1 });    // 未读列表 / 未读数
UserMessageStateSchema.index({ userId: 1, _id: 1 });                   // 断线重连 $gt 游标补发
UserMessageStateSchema.index({ userId: 1, messageId: 1 }, { unique: true }); // 防止重复投递
