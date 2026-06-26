import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user.type';
import { ConnectMessageStreamDto } from '../dto/connect-stream-query.dto';
import { CreateMessageDto } from '../dto/create-message.dto';
import { TeamsService } from '../../teams/teams.service';
import { MessagesManager } from '../manager/messages.manager';
import { MessagesPollManager } from '../manager/messages-poll.manager';
import { SseTransportService } from '../service/sse-transport.service';
import {
  clampInt,
  clampPage,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  POLL_LIMIT_DEFAULT,
  POLL_LIMIT_MAX,
} from '../utils/query-clamp.util';

@Controller('label-platform-admin/message')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessagesController {
  private readonly logger = new Logger(MessagesController.name);

  constructor(
    private readonly messagesManager: MessagesManager,
    private readonly messagesPollManager: MessagesPollManager,
    private readonly sseTransport: SseTransportService,
    private readonly teamsService: TeamsService,
  ) {}

  @Get('poll')
  poll(
    @CurrentUser() user: AuthUser,
    @Query('lastEventId') lastEventId?: string,
    @Query('limit') limit = POLL_LIMIT_DEFAULT,
  ) {
    const safeLimit = clampInt(limit, {
      min: 1,
      max: POLL_LIMIT_MAX,
      fallback: POLL_LIMIT_DEFAULT,
    });
    return this.messagesPollManager.pollMessages(
      user.userId,
      lastEventId?.trim() || undefined,
      safeLimit,
    );
  }

  // 通常SSE 规范建议用GET，但是这里使用POST可以通过 @Body 优雅地接收较长的参数，避开URL长度限制
  @Post('stream')

  // 长连接需要长时间挂起，必须跳过频繁请求拦截，否则会被网关误杀断开
  @SkipThrottle()
  streamMessages(

    // 从HTTP Body中注入并校验前面提到的断线重连 DTO
    @Body() dto: ConnectMessageStreamDto,

    // 自定义装饰器：从当前登录台(JWT Token)中安全地提取用户信息，防止平行越权
    @CurrentUser() user: AuthUser,

    // 尝试从 HTTP 请求头中提取标准规范的 ‘last-event-id'
    @Headers('last-event-id') lastEventIdHeader: string | undefined,

    // 注入底层的 Express 请求与响应对象，用于后续控制原始连接的挂起与响应头设置
    @Req() req: Request,
    @Res() res: Response,
  ): void {

    // 提取用户的唯一ID，作为后续消息流通到的隔离标识(确保用户只能听到自己的消息)
    const currentUserId = user.userId;

    // 核心双通道兼容兜底逻辑：
    // 优先取Header里的 ID -> 如果没有则取 Body 里的 DTO 参数 -> 顺便调用 .trim() 提出前后空格
    // 如果都是空值，则统一定位undefined，代表这是一次 “全新的，非断线重连” 的连接
    const lastEventId = lastEventIdHeader?.trim() || dto?.lastEventId?.trim() || undefined;

    // 打印日志
    this.logger.log(
      `[MessagesController] 用户 ${currentUserId} 建立 SSE 连接，lastEventId: ${lastEventId ?? '无'}`,
    );

    // 业务核心：调用消息管理器，传入“用户ID” 和 “上次听到的事件ID”
    // 底层会返回一个 RxJS Observable流 ( channel$), 如果 lastEventId存在，底层代码会自动的把错过历史消息塞进这个流的最前面
    const channel$ = this.messagesManager.getStreamingChannel(currentUserId, lastEventId);

    // 11. 传输层配置：将这个RxJS数据流正式挂载(attach)到当前的 HTTP 响应对象上
    //     它会在底层自动设置响应头 `Content-Type: text/event-stream`、`Cache-Control: no-cache`，
    //     维持长连接不关闭，并将 `channel$` 流里后续产生的每条新消息以 `data: {...}\n\n` 的格式持续推向前端
    this.sseTransport.attach(channel$, req, res);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: AuthUser): Promise<{ count: number }> {
    const count = await this.messagesManager.countUnread(user.userId);
    return { count };
  }

  @Get('get-all')
  getAll(
    @CurrentUser() user: AuthUser,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = PAGE_SIZE_DEFAULT,
  ) {
    const safePage = clampPage(page);
    const safePageSize = clampInt(pageSize, {
      min: 1,
      max: PAGE_SIZE_MAX,
      fallback: PAGE_SIZE_DEFAULT,
    });
    return this.messagesManager.getMessageList(user.userId, {
      page: safePage,
      pageSize: safePageSize,
    });
  }

  @Get('get-detail')
  getDetail(@CurrentUser() user: AuthUser, @Query('messageId') messageId: string) {
    return this.messagesManager.getMessageDetail(user.userId, messageId);
  }

  @Post('apply-submit')
  @Roles('admin')
  applySubmit(@CurrentUser() user: AuthUser, @Body() dto: Record<string, unknown>) {
    return this.messagesManager.applySubmit(user.userId, dto);
  }

  /** 管理员全员群发；队长仅可向本队成员发送 */
  @Post('send')
  @Roles('admin', 'leader')
  async send(@CurrentUser() user: AuthUser, @Body() dto: CreateMessageDto) {
    await this.teamsService.assertMessageRecipients(user, dto.receiverIds);
    return this.messagesManager.sendMessage(user.userId, dto);
  }

  @Post('read')
  read(@CurrentUser() user: AuthUser, @Body() dto: { messageId: string }) {
    return this.messagesManager.markRead(user.userId, [dto.messageId]);
  }

  @Post('batch-read')
  batchRead(@CurrentUser() user: AuthUser, @Body() dto: { messageIds?: string[] }) {
    return this.messagesManager.markRead(user.userId, dto?.messageIds);
  }

  @Post('delete')
  remove(@CurrentUser() user: AuthUser, @Body() dto: { messageId: string }) {
    return this.messagesManager.removeStates(user.userId, [dto.messageId]);
  }

  @Post('batch-delete')
  batchRemove(@CurrentUser() user: AuthUser, @Body() dto: { messageIds: string[] }) {
    return this.messagesManager.removeStates(user.userId, dto.messageIds);
  }
}
