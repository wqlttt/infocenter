import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { MessagesManager } from '../messages/manager/messages.manager';
import { AuthUser } from '../common/types/auth-user.type';
import { CreateTeamDto } from './dto/create-team.dto';
import { Team, TeamDocument } from './schemas/team.schema';

/** 入团申请演示：消息内跳转外链 */
const DEMO_JOIN_LINK = 'https://www.molardata.com/';

@Injectable()
export class TeamsService {
  constructor(
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
    private usersService: UsersService,
    private messagesManager: MessagesManager,
  ) {}

  findAll() {
    return this.teamModel.find().sort({ createdAt: -1 }).exec();
  }

  findById(id: string) {
    return this.teamModel.findById(id).exec();
  }

  async create(dto: CreateTeamDto) {
    const leader = await this.usersService.findById(dto.leaderId);
    if (!leader || leader.role !== 'leader') {
      throw new BadRequestException('Leader user not found or invalid role');
    }
    if (leader.teamId) {
      throw new BadRequestException('Leader already assigned to a team');
    }
    const existingTeam = await this.teamModel
      .findOne({ leaderId: leader._id })
      .exec();
    if (existingTeam) {
      throw new BadRequestException('Leader already has a team');
    }
    const team = await this.teamModel.create({
      name: dto.name,
      leaderId: leader._id,
      memberIds: [],
    });
    await this.usersService.setTeamId(leader._id.toString(), team._id);
    return team;
  }

  async addMemberIfAbsent(teamId: string, memberId: Types.ObjectId) {
    const team = await this.teamModel.findById(teamId).exec();
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    if (!team.memberIds.some((id) => id.equals(memberId))) {
      team.memberIds.push(memberId);
      await team.save();
    }
    return team;
  }

  async getMembers(teamId: string, user: AuthUser) {
    const team = await this.teamModel.findById(teamId).exec();
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    const isLeader =
      user.role === 'leader' && team.leaderId.toString() === user.userId;
    const isAdmin = user.role === 'admin';
    if (!isLeader && !isAdmin) {
      throw new ForbiddenException('Cannot view team members');
    }
    const leader = await this.usersService.findById(team.leaderId.toString());
    const members = await Promise.all(
      team.memberIds.map((id) => this.usersService.findById(id.toString())),
    );
    return {
      teamId: team._id.toString(),
      name: team.name,
      leader: leader
        ? { id: leader._id.toString(), username: leader.username }
        : null,
      members: members
        .filter(Boolean)
        .map((m) => ({ id: m!._id.toString(), username: m!.username })),
    };
  }

  /** 队长仅可向本队 memberIds 发消息；管理员不受限 */
  async assertMessageRecipients(actor: AuthUser, receiverIds: string[]) {
    if (!receiverIds?.length) {
      throw new BadRequestException('receiverIds 不能为空');
    }
    if (actor.role === 'admin') return;

    if (actor.role !== 'leader') {
      throw new ForbiddenException('无权发送消息');
    }

    const team = await this.teamModel
      .findOne({ leaderId: new Types.ObjectId(actor.userId) })
      .exec();
    if (!team) {
      throw new BadRequestException('队长未绑定组织');
    }

    const allowed = new Set(team.memberIds.map((id) => id.toString()));
    const invalid = receiverIds.filter((id) => !allowed.has(id));
    if (invalid.length) {
      throw new ForbiddenException('只能向本队成员发送消息');
    }
  }

  async requestJoin(teamId: string, user: AuthUser) {
    if (user.role !== 'member') {
      throw new ForbiddenException('Only members can request to join a team');
    }
    const member = await this.usersService.findById(user.userId);
    if (!member) {
      throw new NotFoundException('User not found');
    }
    if (member.teamId) {
      throw new BadRequestException('Already assigned to a team');
    }
    const team = await this.teamModel.findById(teamId).exec();
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    const linkUrl = DEMO_JOIN_LINK;
    // 须走 MessagesManager.sendMessage，否则单机 Mongo 无 Change Stream 时无法 SSE 实时推送
    await this.messagesManager.sendMessage(user.userId, {
      title: `${member.username} 申请加入 ${team.name}`,
      content: `成员 ${member.username} 希望加入您的组织「${team.name}」，请点击消息中的链接查看详情。`,
      linkUrl,
      sendMessageType: '站内信',
      receiverIds: [team.leaderId.toString()],
    });
    return { requested: true, teamId: team._id.toString() };
  }

  async approveJoinRequest(teamId: string, userId: string, actor: AuthUser) {
    const team = await this.teamModel.findById(teamId).exec();
    if (!team) {
      throw new NotFoundException('Team not found');
    }
    const isLeader =
      actor.role === 'leader' && team.leaderId.toString() === actor.userId;
    const isAdmin = actor.role === 'admin';
    if (!isLeader && !isAdmin) {
      throw new ForbiddenException('Cannot approve join request');
    }
    const member = await this.usersService.findById(userId);
    if (!member || member.role !== 'member') {
      throw new BadRequestException('Member not found');
    }
    if (member.teamId) {
      throw new BadRequestException('Member already in a team');
    }
    await this.addMemberIfAbsent(teamId, new Types.ObjectId(userId));
    await this.usersService.setTeamId(userId, new Types.ObjectId(teamId));
    return {
      approved: true,
      teamId,
      userId,
      teamName: team.name,
      username: member.username,
    };
  }
}
