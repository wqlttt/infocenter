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

  @Post('stream')
  @SkipThrottle()
  streamMessages(
    @Body() dto: ConnectMessageStreamDto,
    @CurrentUser() user: AuthUser,
    @Headers('last-event-id') lastEventIdHeader: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const currentUserId = user.userId;
    const lastEventId = lastEventIdHeader?.trim() || dto?.lastEventId?.trim() || undefined;

    this.logger.log(
      `[MessagesController] 用户 ${currentUserId} 建立 SSE 连接，lastEventId: ${lastEventId ?? '无'}`,
    );

    const channel$ = this.messagesManager.getStreamingChannel(currentUserId, lastEventId);
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
