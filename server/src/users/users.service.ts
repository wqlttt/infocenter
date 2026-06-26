import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  findByUsername(username: string) {
    return this.userModel.findOne({ username }).exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  /** 所有用户（id + username + role），供 admin 选择收件人 */
  findAll() {
    return this.userModel.find({}, { username: 1, role: 1 }).sort({ username: 1 }).exec();
  }

  create(data: Partial<User>) {
    return this.userModel.create(data);
  }

  updateRefreshToken(userId: string, refreshTokenHash: string | null) {
    return this.userModel
      .findByIdAndUpdate(userId, { refreshTokenHash }, { new: true })
      .exec();
  }

  setTeamId(userId: string, teamId: Types.ObjectId | null) {
    return this.userModel
      .findByIdAndUpdate(userId, { teamId }, { new: true })
      .exec();
  }
}
