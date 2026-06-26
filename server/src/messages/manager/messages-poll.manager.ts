import { Injectable, Logger } from '@nestjs/common';
import { MessagesService, MessagePayload } from '../service/messages.service';
import { POLL_LIMIT_DEFAULT } from '../utils/query-clamp.util';

export interface PollResult {
  list: MessagePayload[];
  lastEventId: string | undefined;
  unreadCount: number;
  hasMore: boolean;
}

/** 短轮询编排（与 SSE MessagesManager 分离，不共享热流） */
@Injectable()
export class MessagesPollManager {
  private readonly logger = new Logger(MessagesPollManager.name);

  constructor(private readonly messagesService: MessagesService) {}

  /** 短轮询拉取消息：有 lastEventId 则增量，否则首屏未读；返回列表、游标与未读数。 */
  async pollMessages(
    currentUserId: string,
    lastEventId?: string,
    limit = POLL_LIMIT_DEFAULT,
  ): Promise<PollResult> {
    let states: any[];

    if (lastEventId) {
      this.logger.log(
        `[MessagesPollManager] 用户 ${currentUserId} 轮询,检索状态ID大于 ${lastEventId} 的新投递...`,
      );
      // 增量轮询含已读态（保证游标高水位推进）；未读红点由下方 countUnread 纠正
      try {
        states = await this.messagesService.findStatesAfterId(currentUserId, lastEventId, limit);
      } catch {
        this.logger.warn(`[MessagesPollManager] lastEventId 非法: ${lastEventId},本轮返回空`);
        states = [];
      }
    } else {
      this.logger.log(`[MessagesPollManager] 用户 ${currentUserId} 首屏,拉取历史未读消息...`);
      states = await this.messagesService.findUnreadStates(currentUserId, limit);
    }

    const list = await this.messagesService.joinBodies(states);
    const unreadCount = await this.messagesService.countUnread(currentUserId);
    const nextCursor = await this.resolveHighWaterMark(currentUserId, lastEventId, states);

    return {
      list,
      lastEventId: nextCursor,
      unreadCount,
      hasMore: states.length >= limit,
    };
  }

  /** 计算下一轮轮询游标（含已删记录，避免游标回退重复拉取）。 */
  private async resolveHighWaterMark(
    currentUserId: string,
    lastEventId: string | undefined,
    states: any[],
  ): Promise<string | undefined> {
    if (lastEventId) {
      return states.length ? states[states.length - 1]._id.toString() : lastEventId;
    }
    const newest = await this.messagesService.findNewestState(currentUserId);
    return newest?._id?.toString();
  }
}
