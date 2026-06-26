import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { TeamsService } from '../teams/teams.service';
import { Team, TeamDocument } from '../teams/schemas/team.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { MessagesService } from '../messages/service/messages.service';
import { MessagesManager } from '../messages/manager/messages.manager';

const DEMO_PASSWORD = 'demo123';

const DEMO_USERS = [
  { username: 'admin', role: 'admin' as const },
  { username: 'leader', role: 'leader' as const },
  ...Array.from({ length: 10 }, (_, i) => ({
    username: `member${i + 1}`,
    role: 'member' as const,
  })),
];

async function upsertDemoUser(
  userModel: Model<UserDocument>,
  usersService: UsersService,
  demo: (typeof DEMO_USERS)[number],
  passwordHash: string,
) {
  const existing = await usersService.findByUsername(demo.username);
  const patch: Record<string, unknown> = {
    passwordHash,
    role: demo.role,
  };
  // 仅重置成员的 teamId；leader 的 teamId 在 ensureDemoTeam 中绑定
  if (demo.role === 'member') {
    patch.teamId = null;
  }
  if (existing) {
    await userModel.updateOne({ username: demo.username }, patch);
    console.log(`Updated ${demo.username} / ${DEMO_PASSWORD}`);
  } else {
    await usersService.create({
      username: demo.username,
      passwordHash,
      role: demo.role,
      teamId: null,
    });
    console.log(`Created ${demo.username} / ${DEMO_PASSWORD}`);
  }
}

async function ensureDemoTeam(
  teamsService: TeamsService,
  usersService: UsersService,
  teamModel: Model<TeamDocument>,
  leader: UserDocument,
) {
  let team = await teamModel.findOne({ leaderId: leader._id }).exec();
  if (!team) {
    team = await teamsService.create({
      name: 'Demo Team',
      leaderId: leader._id.toString(),
    });
    console.log('Created Demo Team for leader');
  } else {
    await usersService.setTeamId(leader._id.toString(), team._id);
    console.log('Linked leader to Demo Team');
  }
}

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const teamsService = app.get(TeamsService);
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  const teamModel = app.get<Model<TeamDocument>>(getModelToken(Team.name));
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const demo of DEMO_USERS) {
    await upsertDemoUser(userModel, usersService, demo, passwordHash);
  }

  const leader = await usersService.findByUsername('leader');
  if (leader) {
    await ensureDemoTeam(teamsService, usersService, teamModel, leader);
  }

  // 种子消息（演示 SSE 冷热流补发）—— 清旧插新
  const messagesService = app.get(MessagesService);
  {
    // 通过 service 拿到 model 实例来清空（更稳健）
    const msgModel = app.get<any>(getModelToken('MessageInfo'));
    const stateModel = app.get<any>(getModelToken('UserMessageState'));
    await stateModel.deleteMany({});
    await msgModel.deleteMany({});
    console.log('Cleared old demo messages');
  }

  const admin = (await usersService.findByUsername('admin'))!;
  const member1 = (await usersService.findByUsername('member1'))!;
  // leader 已在上面声明，这里 non-null
  const leaderUser = leader!;
  const team = await teamModel.findOne({ leaderId: leaderUser._id }).exec();

  // 群发给 admin + leader + member1
  const stateDocs = await messagesService.create(admin._id.toString(), {
    title: '系统上线通知',
    content: 'InfoCenter 消息中心已上线，实时推送已就绪。',
    linkUrl: '',
    sendMessageType: '站内信',
    receiverIds: [
      admin._id.toString(),
      leaderUser._id.toString(),
      member1._id.toString(),
    ],
  });
  // 标记 admin 已读（演示 isRead 字段）
  await messagesService.markRead(admin._id.toString(), [stateDocs[0].messageId.toString()]);

  // 再发一条给 leader
  await messagesService.create(admin._id.toString(), {
    title: 'SSE 演示说明',
    content: 'SSE 冷热流合并：连接时先补发历史未读，随后实时推送。断线重连通过 Last-Event-ID 游标补发缺失的消息。',
    linkUrl: '',
    sendMessageType: '站内信',
    receiverIds: [leaderUser._id.toString()],
  });

  if (team) {
    await messagesService.create(member1._id.toString(), {
      title: 'member1 申请加入 Demo Team',
      content: '成员 member1 希望加入您的组织「Demo Team」，请点击消息中的链接查看详情。',
      linkUrl: 'https://www.molardata.com/',
      sendMessageType: '站内信',
      receiverIds: [leaderUser._id.toString()],
    });
    console.log('Created team join request demo message for leader');
  }

  console.log('Created demo messages for SSE pipeline');

  console.log('\nDemo accounts (password for all: demo123):');
  console.log('  admin        -> 消息中心（群发）');
  console.log('  leader       -> 队长');
  console.log('  member1~10   -> 成员（未入队，可体验入团申请）');

  await app.close();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
