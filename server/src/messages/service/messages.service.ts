import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateMessageDto } from '../dto/create-message.dto';
import {
  MessageInfo,
  MessageInfoDocument,
  UserMessageState,
  UserMessageStateDocument,
} from '../schemas/message.schema';

/** 下发给前端的统一 payload：本体 + 当前用户状态，扁平化 */
export interface MessagePayload {
  _id: string;
  messageId: string;
  isRead: boolean;
  title: string;
  content: string;
  linkUrl: string;
  sendUserId: string;
  sendMessageType: string;
  sendMessageTime: Date;
}

/** 消息数据层：MessageInfo / userMessageState 的 CRUD 与 payload 拼装。 */
@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectModel(MessageInfo.name)
    private readonly messageInfoModel: Model<MessageInfoDocument>,
    @InjectModel(UserMessageState.name)
    private readonly stateModel: Model<UserMessageStateDocument>,
  ) {}

  /** 将 userId 字符串转为 Mongo ObjectId。 */
  private uid(value: string): Types.ObjectId {
    return new Types.ObjectId(value);
  }

  /** 用户收件箱可见记录（未软删） */
  private activeMailboxFilter(userId: string, extra: Record<string, unknown> = {}) {
    return { userId: this.uid(userId), isDeleted: false, ...extra };
  }

  /** 将 state + body 拼装为前端统一的 MessagePayload。 */
  toClientPayload(state: any, body: any): MessagePayload {
    return {
      _id: state._id?.toString(),
      messageId: state.messageId?.toString(),
      isRead: !!state.isRead,
      title: body?.title,
      content: body?.content,
      linkUrl: body?.linkUrl ?? '',
      sendUserId: body?.sendUserId?.toString(),
      sendMessageType: body?.sendMessageType,
      sendMessageTime: body?.sendMessageTime,
    };
  }

  /** 批量按 states 关联 MessageInfo 并转为 payload 列表。 */
  async joinBodies(states: any[]): Promise<MessagePayload[]> {
    if (states.length === 0) return [];
    const messageIds = states.map((s) => s.messageId);
    const bodies = await this.messageInfoModel.find({ _id: { $in: messageIds } }).exec();
    const bodyMap = new Map(bodies.map((b) => [b._id.toString(), b]));
    return states
      .map((s) => {
        const body = bodyMap.get(s.messageId.toString());
        return body ? this.toClientPayload(s, body) : null;
      })
      .filter((p): p is MessagePayload => p !== null);
  }

  /** 按 messageId 查询消息本体。 */
  findMessageById(id: string) {
    return this.messageInfoModel.findById(id).exec();
  }

  /** 查询用户未读且未软删的状态记录（倒序，限条数）。 */
  findUnreadStates(userId: string, limit = 200) {
    return this.stateModel
      .find(this.activeMailboxFilter(userId, { isRead: false }))
      .sort({ _id: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * 按 userMessageStates._id 游标增量拉取。
   *
   * ⚠️ 依赖 MongoDB ObjectId 在同一进程内生成时的时间戳单调性（$gt 比较）。
   * 当前部署为 nohup 单进程单实例，安全；若改为 PM2 cluster / 多实例写库，
   * 不同进程的 _id 不再全局有序，此游标会漏消息——扩容前须改用
   * sendMessageTime + _id 复合游标或集中式 ID 生成。
   */
  findStatesAfterId(userId: string, cursor: string, limit = 200, unreadOnly = false) {
    const filter: Record<string, unknown> = {
      ...this.activeMailboxFilter(userId),
      _id: { $gt: this.toObjectIdOrThrow(cursor, '游标 ID') },
    };
    if (unreadOnly) filter.isRead = false;
    return this.stateModel
      .find(filter)
      .sort({ _id: 1 })
      .limit(limit)
      .exec();
  }

  /** 游标高水位：含已软删记录，避免删最新消息后游标回退重复拉取 */
  findNewestState(userId: string) {
    return this.stateModel
      .findOne({ userId: this.uid(userId) })
      .sort({ _id: -1 })
      .exec();
  }

  /** 分页查询用户收件箱并返回 payload 列表与总数。 */
  async findStateList(
    userId: string,
    { page, pageSize }: { page: number; pageSize: number },
  ): Promise<{ list: MessagePayload[]; total: number; page: number; pageSize: number }> {
    const filter = this.activeMailboxFilter(userId);
    const [states, total] = await Promise.all([
      this.stateModel.find(filter).sort({ _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).exec(),
      this.stateModel.countDocuments(filter),
    ]);
    return { list: await this.joinBodies(states), total, page, pageSize };
  }

  /** 按用户 + messageId 查单条可见状态，非法 ID 返回 null。 */
  findStateByUserAndMessage(userId: string, messageId: string) {
    try {
      return this.stateModel.findOne({
        ...this.activeMailboxFilter(userId),
        messageId: new Types.ObjectId(messageId),
      }).exec();
    } catch {
      return null;
    }
  }

  /** 统计用户未读且未软删的消息数。 */
  countUnread(userId: string): Promise<number> {
    return this.stateModel.countDocuments(this.activeMailboxFilter(userId, { isRead: false })).exec();
  }

  /** 校验并转为 ObjectId，非法则抛 400。 */
  private toObjectIdOrThrow(value: string, label: string): Types.ObjectId {
    if (!value || !Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${label} 不是有效的 ID: ${value}`);
    }
    return new Types.ObjectId(value);
  }

  /** 写入 MessageInfo 并为各收件人 bulk 插入 userMessageState。 */
  async create(sendUserId: string, dto: CreateMessageDto): Promise<UserMessageStateDocument[]> {
    if (!dto.receiverIds?.length) {
      throw new BadRequestException('receiverIds 不能为空');
    }

    const senderOid = this.toObjectIdOrThrow(sendUserId, '发送者 ID');
    const body = await this.messageInfoModel.create({
      sendUserId: senderOid,
      title: dto.title,
      content: dto.content,
      linkUrl: dto.linkUrl ?? '',
      sendMessageType: dto.sendMessageType,
      sendMessageTime: new Date(),
    });

    const stateDocs = dto.receiverIds.map((uid) => ({
      userId: this.toObjectIdOrThrow(uid, '收件人 ID'),
      messageId: body._id,
      isRead: false,
      isDeleted: false,
      deletedAt: null,
    }));

    const inserted = await this.stateModel.insertMany(stateDocs, { ordered: false });
    // 已知取舍：insertMany 部分失败时不回删 messageInfo 本体（单机无事务）；
    // ordered:false 还可能部分收件人写入成功。量小可接受，生产需补偿或事务。
    this.logger.log(`[MessagesService] 消息 ${body._id} 已发送，投递 ${inserted.length} 个收件人`);
    return inserted;
  }

  /** create 的对外封装，返回 messageId、投递数与 state 文档。 */
  async sendMessage(
    sendUserId: string,
    dto: CreateMessageDto,
  ): Promise<{ messageId: string; delivered: number; states: UserMessageStateDocument[] }> {
    const states = await this.create(sendUserId, dto);
    return {
      messageId: states[0]?.messageId.toString() ?? '',
      delivered: states.length,
      states,
    };
  }

  /** 将指定或全部未读状态置为已读（不含已软删）。 */
  markRead(userId: string, messageIds?: string[]) {
    const filter: Record<string, unknown> = this.activeMailboxFilter(userId, { isRead: false });
    if (messageIds?.length) {
      filter.messageId = {
        $in: messageIds.map((id) => this.toObjectIdOrThrow(id, 'messageId')),
      };
    }
    return this.stateModel.updateMany(filter, { $set: { isRead: true } }).exec();
  }

  /** 软删除：仅已读消息可删，未读需先 markRead */
  async removeStates(userId: string, messageIds: string[]) {
    if (!messageIds?.length) {
      throw new BadRequestException('messageIds 不能为空');
    }
    const messageOids = messageIds.map((id) => this.toObjectIdOrThrow(id, 'messageId'));
    const uid = this.uid(userId);
    const unreadCount = await this.stateModel.countDocuments({
      userId: uid,
      isDeleted: false,
      isRead: false,
      messageId: { $in: messageOids },
    }).exec();
    if (unreadCount > 0) {
      throw new BadRequestException('未读消息需先标记已读后才能删除');
    }
    const now = new Date();
    return this.stateModel.updateMany(
      {
        userId: uid,
        isDeleted: false,
        isRead: true,
        messageId: { $in: messageOids },
      },
      { $set: { isDeleted: true, deletedAt: now } },
    ).exec();
  }
}
