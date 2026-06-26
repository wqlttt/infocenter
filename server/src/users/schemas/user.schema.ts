import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, index: true })
  username: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, enum: ['admin', 'leader', 'member'] })
  role: string;

  @Prop({ type: Types.ObjectId, ref: 'Team', default: null })
  teamId: Types.ObjectId | null;

  @Prop({ enum: ['active', 'disabled'], default: 'active' })
  status: string;

  @Prop({ type: String, default: null })
  refreshTokenHash: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
