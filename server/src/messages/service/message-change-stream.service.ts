import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChangeStream } from 'mongodb';
import { MessagesManager } from '../manager/messages.manager';
import {
  UserMessageState,
  UserMessageStateDocument,
} from '../schemas/message.schema';

/**
 * 监听 userMessageStates 的 insert → handleNewMessage。
 * 单节点 Mongo 无副本集时 Change Stream 不可用，由 Manager 在 send 后走 fallback。
 */
@Injectable()
export class MessageChangeStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageChangeStreamService.name);
  private changeStream: ChangeStream | null = null;
  private fallbackMode = false;

  constructor(
    @InjectModel(UserMessageState.name)
    private readonly stateModel: Model<UserMessageStateDocument>,
    @Inject(forwardRef(() => MessagesManager))
    private readonly messagesManager: MessagesManager,
  ) {}

  /** 是否因 Change Stream 不可用而走 send 后 fallback 推送。 */
  useFallback(): boolean {
    return this.fallbackMode;
  }

  /** 启动时对 userMessageStates insert 建立 Change Stream 监听。 */
  onModuleInit(): void {
    try {
      this.changeStream = this.stateModel.watch(
        [{ $match: { operationType: 'insert' } }],
        { fullDocument: 'updateLookup' },
      );

      this.changeStream.on('change', (event) => {
        if (event.operationType !== 'insert' || !event.fullDocument) return;
        void this.messagesManager.handleNewMessage(event.fullDocument);
      });

      this.changeStream.on('error', (err) => {
        this.logger.warn(
          `[MessageChangeStream] Change Stream 异常，启用 send 后 fallback: ${err?.message ?? err}`,
        );
        this.fallbackMode = true;
      });

      this.logger.log('[MessageChangeStream] 已监听 userMessageStates insert');
    } catch (err) {
      this.fallbackMode = true;
      this.logger.warn(
        `[MessageChangeStream] 无法启动 Change Stream（需副本集），启用 fallback: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  /** 进程退出时关闭 Change Stream，释放资源。 */
  onModuleDestroy(): void {
    void this.changeStream?.close();
    this.changeStream = null;
  }
}
