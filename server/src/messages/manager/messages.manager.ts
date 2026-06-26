import { forwardRef, Inject, Injectable, Logger, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { Subject, Observable, merge, from, defer, timer } from 'rxjs';
import { filter, map, mergeMap, takeUntil } from 'rxjs/operators';
import { Types } from 'mongoose';
import { MessagesService, MessagePayload } from '../service/messages.service';
import { MessageChangeStreamService } from '../service/message-change-stream.service';
import { CreateMessageDto } from '../dto/create-message.dto';

interface TransportEnvelope {
  targetUserId: string;
  payload: MessagePayload;
}

const SSE_MAX_LIFETIME_MS = 4 * 60 * 60 * 1000;
const HISTORY_LIMIT = 200;

@Injectable()
export class MessagesManager implements OnModuleDestroy {
  private readonly logger = new Logger(MessagesManager.name);
  private readonly messageCenter$ = new Subject<TransportEnvelope>();

  constructor(
    private readonly messagesService: MessagesService,
    @Inject(forwardRef(() => MessageChangeStreamService))
    private readonly changeStreamService: MessageChangeStreamService,
  ) {}

  /** Change Stream 或 fallback 收到新投递时，组装 payload 并推入 SSE 热流。 */
  async handleNewMessage(stateDoc: any): Promise<void> {
    this.logger.log(`[MessagesManager] 接收到实时投递记录，状态ID: ${stateDoc._id}`);

    if (!stateDoc?.userId || !stateDoc?.messageId) {
      this.logger.warn(`[MessagesManager] 状态记录 ${stateDoc?._id} 缺少 userId/messageId，已跳过`);
      return;
    }

    const body = await this.messagesService.findMessageById(stateDoc.messageId.toString());
    if (!body) {
      this.logger.warn(`[MessagesManager] 本体 ${stateDoc.messageId} 不存在，跳过实时下发`);
      return;
    }

    this.messageCenter$.next({
      targetUserId: stateDoc.userId.toString(),
      payload: this.messagesService.toClientPayload(stateDoc, body),
    });
  }

  /** SSE 建连时按 lastEventId 补发历史，无游标则拉未读列表。 */
  private async getHistoryMessages(currentUserId: string, lastEventId?: string): Promise<MessagePayload[]> {
    let states: any[];

    if (lastEventId) {
      this.logger.log(
        `[MessagesManager] 用户 ${currentUserId} 闪断重连，检索状态ID大于 ${lastEventId} 的补发消息...`,
      );
      // 含已读态（保证游标连续）；跨端已读依赖前端 dedup 路径同步 isRead
      try {
        new Types.ObjectId(lastEventId);
        states = await this.messagesService.findStatesAfterId(currentUserId, lastEventId, HISTORY_LIMIT);
      } catch {
        this.logger.warn(`[MessagesManager] lastEventId 非法: ${lastEventId}，退化为按未读拉取`);
        states = await this.messagesService.findUnreadStates(currentUserId, HISTORY_LIMIT);
      }
    } else {
      this.logger.log(`[MessagesManager] 为用户 ${currentUserId} 检索历史未读消息...`);
      states = await this.messagesService.findUnreadStates(currentUserId, HISTORY_LIMIT);
    }

    if (states.length === 0) return [];
    return this.messagesService.joinBodies(states);
  }

  /** 将业务 payload 转为 SSE MessageEvent（id 用 userMessageState._id）。 */
  private toMessageEvent(payload: MessagePayload): MessageEvent {
    return {
      id: payload._id,
      data: payload,
    } as MessageEvent;
  }

  /** 合并历史补发与实时热流，供 SSE 长连接订阅（最长 4 小时）。 */
  getStreamingChannel(currentUserId: string, lastEventId?: string): Observable<MessageEvent> {
    this.logger.log(`[MessagesManager] 为用户 ${currentUserId} 构建数据流合并管道`);

    const historyStream$ = defer(() =>
      from(this.getHistoryMessages(currentUserId, lastEventId)),
    ).pipe(
      mergeMap((payloads: MessagePayload[]) => from(payloads)),
      map((payload) => this.toMessageEvent(payload)),
    );

    const realTimeStream$ = this.messageCenter$.pipe(
      filter((envelope) => envelope.targetUserId === currentUserId),
      map((envelope) => this.toMessageEvent(envelope.payload)),
    );

    return merge(historyStream$, realTimeStream$).pipe(
      takeUntil(timer(SSE_MAX_LIFETIME_MS)),
    );
  }

  /** 查询当前用户未读消息数量。 */
  countUnread(userId: string): Promise<number> {
    return this.messagesService.countUnread(userId);
  }

  /** 分页返回当前用户收件箱（已过滤软删）。 */
  getMessageList(
    currentUserId: string,
    { page = 1, pageSize = 20 }: { page?: number; pageSize?: number },
  ) {
    return this.messagesService.findStateList(currentUserId, { page, pageSize });
  }

  /** 按 messageId 查询当前用户的一条消息详情。 */
  async getMessageDetail(currentUserId: string, messageId: string): Promise<MessagePayload | null> {
    const state = await this.messagesService.findStateByUserAndMessage(currentUserId, messageId);
    if (!state) return null;
    const [payload] = await this.messagesService.joinBodies([state]);
    return payload ?? null;
  }

  /** 标记已读；不传 messageIds 时将该用户全部未读置为已读。 */
  markRead(userId: string, messageIds?: string[]) {
    return this.messagesService.markRead(userId, messageIds);
  }

  /** 软删除指定消息（须已读，否则 Service 抛 400）。 */
  removeStates(userId: string, messageIds: string[]) {
    return this.messagesService.removeStates(userId, messageIds);
  }

  /** 创建消息并投递；单机 Mongo 无 Change Stream 时主动 fallback 推送 SSE。 */
  async sendMessage(
    sendUserId: string,
    dto: CreateMessageDto,
  ): Promise<{ messageId: string; delivered: number }> {
    const result = await this.messagesService.sendMessage(sendUserId, dto);

    if (this.changeStreamService.useFallback()) {
      for (const state of result.states) {
        await this.handleNewMessage(state);
      }
    }

    return { messageId: result.messageId, delivered: result.delivered };
  }

  /** 非管理员提交群发申请（占位，待接审批落库后再 sendMessage）。 */
  async applySubmit(applicantId: string, dto: any): Promise<{ applied: boolean }> {
    this.logger.log(`[MessagesManager] 用户 ${applicantId} 提交群发申请,待审批`);
    // TODO: 写入审批集合 messageApply,状态 pending;审批通过后再调用 this.sendMessage(...)
    void dto;
    return { applied: true };
  }

  /** 进程退出时关闭 SSE 热流 Subject，避免泄漏订阅。 */
  onModuleDestroy() {
    this.messageCenter$.complete();
  }
}
