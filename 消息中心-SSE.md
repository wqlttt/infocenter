# 后端

## SSE 表设计

MessageInfo表

```js
Collection: MessageInfo
{
  // 消息本体
  _id: ObjectId,
  sendUserId: ObjectId,      // 发消息人
  title: String,             // 消息题目
  content: String,           // 消息文本
  linkUrl: String,           // 链接(可以嵌入HTML 或 直接跳转到 业务场景中)

  // 消息属性
  sendMessageType: String,   // ['站内信', '邮件', '短信']
  sendMessageTime: Date      // 发送时间
}
```

userMessageStates表

```js
Collection: userMessageStates
{
  // 收件箱:每个收件人 × 每条消息 = 一条记录
  _id: ObjectId,             // 同时用作 SSE 游标(Last-Event-ID)+ 前端去重 key
  userId: ObjectId,          // 收件人(投递目标)
  messageId: ObjectId,       // → MessageInfo._id

  // 站内信是否已读(只影响本条投递的展示状态,不影响其他收件人,也不影响发送)
  isRead: Boolean
}
```

## SSE API

```ts
# 查消息内容
GET /api/label-platform-admin/message/get-all        # 获取所有消息(本体 join 当前用户状态)
GET /api/label-platform-admin/message/get-detail     # 获取单条消息详情内容
GET /api/label-platform-admin/message/unread-count    # 获取当前用户未读数(红点)

# 发送消息
POST /api/label-platform-admin/message/apply-submit  # 提交申请
POST /api/label-platform-admin/message/send          # 群发消息

# 消息状态操作
POST /api/label-platform-admin/message/read          # 消息已读
POST /api/label-platform-admin/message/batch-read    # 消息一键已读

POST /api/label-platform-admin/message/delete        # 消息删除
POST /api/label-platform-admin/message/batch-delete  # 消息批量删除

# SSE
POST /api/label-platform-admin/message/stream        # 接收前端fetch-event-source
```

## SSE 代码大概逻辑

sse/controller.ts

```js
import { Controller, Get, Post, Body, Query, Headers, Req, Res, UseGuards, Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { TaskAdmin } from '@auth/core/task.guard';
import { AuthUser } from '@framework';
import { User } from '@schema/user/user.schema';
import { ConnectMessageStreamDto } from '../dto/message.dto';
import { MessageManager } from '../manager/message.manager';
import { SseTransportService } from '../service/sse-transport.service';

@Controller('message')
export class MessageController {
  private readonly logger = new Logger(MessageController.name);

  constructor(
    private readonly messageManager: MessageManager,
    private readonly sseTransport: SseTransportService,
  ) {}

  // 用 POST：连接需要带 body（鉴权 / 其他参数），fetch-event-source 支持 POST + body。
  // 传输仍手写 @Res（不用 @Sse），以掌控心跳 / 反代缓冲 / 断连清理。
  // @SkipThrottle 避免长连接被限流中间件误伤。
  @Post('stream')
  @SkipThrottle()
  @UseGuards(TaskAdmin)
  streamMessages(
    @Body() dto: ConnectMessageStreamDto,
    @AuthUser() user: User,
    // fetch-event-source 断线重连自动携带；HTTP 规范要求 Header 名小写
    @Headers('last-event-id') lastEventIdHeader: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    // 安全：身份用服务端解密出的 user._id，杜绝客户端伪造
    const currentUserId = user._id.toString();
    // 游标：Header 优先（标准 SSE 重连协议），body 兜底；trim 后空串归一为 undefined
    const lastEventId = lastEventIdHeader?.trim() || dto?.lastEventId?.trim() || undefined;

    this.logger.log(
      `[MessageController] 用户 ${currentUserId} 建立 SSE 连接，lastEventId: ${lastEventId ?? '无'}`,
    );

    const channel$ = this.messageManager.getStreamingChannel(currentUserId, lastEventId);
    // 订阅并写流；客户端断开时自动 unsubscribe，释放冷 / 热流
    this.sseTransport.attach(channel$, req, res);
  }

  // 未读数（红点）：前端首屏、tab 切换时拉一次；实时增减靠 SSE 推送驱动前端自增/自减。
  @Get('unread-count')
  @UseGuards(TaskAdmin)
  async getUnreadCount(@AuthUser() user: User): Promise<{ count: number }> {
    const count = await this.messageManager.countUnread(user._id.toString());
    return { count };
  }

  // ===== 查询 =====

  // 消息列表：查当前用户的状态表 join 本体，分页返回（含 isRead）。
  @Get('get-all')
  @UseGuards(TaskAdmin)
  getAll(
    @AuthUser() user: User,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 20,
  ) {
    return this.messageManager.getMessageList(user._id.toString(), { page: +page, pageSize: +pageSize });
  }

  // 单条详情：按 (当前用户 + messageId) 查，越权拿不到别人的投递记录。
  @Get('get-detail')
  @UseGuards(TaskAdmin)
  getDetail(@AuthUser() user: User, @Query('messageId') messageId: string) {
    return this.messageManager.getMessageDetail(user._id.toString(), messageId);
  }

  // ===== 发送 =====

  // 提交申请：非管理员发起群发申请，落审批队列，不直接投递。
  @Post('apply-submit')
  @UseGuards(TaskAdmin)
  applySubmit(@AuthUser() user: User, @Body() dto: any) {
    return this.messageManager.applySubmit(user._id.toString(), dto);
  }

  // 群发：写 1 条 MessageInfo + N 条 userMessageStates。⚠️ 高危,需更强的发送权限校验。
  @Post('send')
  @UseGuards(TaskAdmin)
  send(@AuthUser() user: User, @Body() dto: any) {
    return this.messageManager.sendMessage(user._id.toString(), dto);
  }

  // ===== 状态操作（一律按 token 里的 userId 作用于状态表，杜绝越权改别人状态）=====

  @Post('read')
  @UseGuards(TaskAdmin)
  read(@AuthUser() user: User, @Body() dto: { messageId: string }) {
    return this.messageManager.markRead(user._id.toString(), [dto.messageId]);
  }

  // 一键已读：不传 messageIds 则标记该用户全部未读。
  @Post('batch-read')
  @UseGuards(TaskAdmin)
  batchRead(@AuthUser() user: User, @Body() dto: { messageIds?: string[] }) {
    return this.messageManager.markRead(user._id.toString(), dto?.messageIds);
  }

  @Post('delete')
  @UseGuards(TaskAdmin)
  remove(@AuthUser() user: User, @Body() dto: { messageId: string }) {
    return this.messageManager.removeStates(user._id.toString(), [dto.messageId]);
  }

  @Post('batch-delete')
  @UseGuards(TaskAdmin)
  batchRemove(@AuthUser() user: User, @Body() dto: { messageIds: string[] }) {
    return this.messageManager.removeStates(user._id.toString(), dto.messageIds);
  }
}
```

sse.manager.ts

```js
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject, Observable, merge, from, defer, timer } from 'rxjs';
import { filter, map, mergeMap, takeUntil } from 'rxjs/operators';
import { Types } from 'mongoose'; // 用于把字符串 lastEventId 转回 ObjectId 做游标比较

// 下发给前端的统一 payload：本体内容 + 当前用户的投递状态，扁平成一个对象。
// _id 用的是【状态表 userMessageStates 的 _id】，不是本体 _id ——
// 因为每个收件人对同一条消息各有一条状态记录，游标 / 去重必须按收件人维度走。
interface MessagePayload {
  _id: string;              // = userMessageStates._id，既是 SSE 游标也是前端去重 key
  messageId: string;        // = MessageInfo._id
  isRead: boolean;          // 当前用户对本条的已读状态
  title: string;
  content: string;
  linkUrl: string;
  sendUserId: string;
  sendMessageType: string;
  sendMessageTime: Date;
}

// 消息信封：在 RxJS 热流中传递。状态表按收件人拆开，所以一个信封只对应一个收件人。
interface TransportEnvelope {
  targetUserId: string;     // 这条投递归属的收件人
  payload: MessagePayload;  // 已 join 好本体、可直接下发的对象
}

// SSE 最大连接时长。超时后客户端会自动重连，防止僵尸连接无限持有热流订阅。
const SSE_MAX_LIFETIME_MS = 4 * 60 * 60 * 1000; // 4 小时

// 单次冷流补发 / 首连拉取的上限。积压过多时只下发最新一批，
// 其余让前端走 GET /get-all 翻页，避免一次性灌爆 SSE。
const HISTORY_LIMIT = 200;

@Injectable() // 单例作用域：全局只有一个 messageCenter$，确保广播正确送达
export class MessageManager implements OnModuleDestroy {
  private readonly logger = new Logger(MessageManager.name);

  // 核心热流总线：所有实时消息都通过这里广播给各 SSE 订阅者。
  // ⚠️ 进程内 Subject，只在单实例内广播。多副本部署需配合 Change Streams（见下文）。
  private readonly messageCenter$ = new Subject<TransportEnvelope>();

  constructor(
    // 替换为你项目中实际的 Repository / Service 类型
    private readonly stateRepo: any,    // userMessageStates 集合
    private readonly messageRepo: any,  // MessageInfo 集合
  ) {}

  // 工具：把「状态记录 + 本体」join 成下发用的扁平 payload。
  private toPayload(state: any, body: any): MessagePayload {
    return {
      _id: state._id?.toString(),
      messageId: state.messageId?.toString(),
      isRead: !!state.isRead,
      title: body?.title,
      content: body?.content,
      linkUrl: body?.linkUrl,
      sendUserId: body?.sendUserId?.toString(),
      sendMessageType: body?.sendMessageType,
      sendMessageTime: body?.sendMessageTime,
    };
  }

  // 1. 实时消息入口：由上游（Change Stream 监听 userMessageStates 的 insert）在
  //    投递记录落库后调用。每条状态记录对应一个收件人，join 本体后推入热流总线。
  async handleNewMessage(stateDoc: any): Promise<void> {
    this.logger.log(`[MessageManager] 接收到实时投递记录，状态ID: ${stateDoc._id}`);

    if (!stateDoc?.userId || !stateDoc?.messageId) {
      this.logger.warn(`[MessageManager] 状态记录 ${stateDoc?._id} 缺少 userId/messageId，已跳过`);
      return;
    }

    // join 本体拿到标题/内容等；本体查不到说明数据不一致，丢弃。
    const body = await this.messageRepo.findById(stateDoc.messageId);
    if (!body) {
      this.logger.warn(`[MessageManager] 本体 ${stateDoc.messageId} 不存在，跳过实时下发`);
      return;
    }

    this.messageCenter$.next({
      targetUserId: stateDoc.userId.toString(),
      payload: this.toPayload(stateDoc, body),
    });
  }

  // 2. 历史离线消息查询（私有）。一律查【状态表】再 join 本体。
  //    a) lastEventId 存在  → 闪断重连，补发"该状态ID之后"的所有消息（$gt 游标）
  //    b) lastEventId 不存在 → 首次连接，拉取全部 unread 状态
  //
  //    ⚠️ lastEventId 来自 HTTP Header，是【字符串】；状态表 _id 是 ObjectId。
  //    直接 { $gt: '字符串' } 在 BSON 类型比较中不会命中，必须先转回 ObjectId。
  //    非法 id 字符串会让 new ObjectId 抛错，用 try/catch 兜底退化为"按未读拉取"。
  private async getHistoryMessages(currentUserId: string, lastEventId?: string): Promise<MessagePayload[]> {
    let states: any[];

    if (lastEventId) {
      this.logger.log(`[MessageManager] 用户 ${currentUserId} 闪断重连，检索状态ID大于 ${lastEventId} 的补发消息...`);
      try {
        const cursor = new Types.ObjectId(lastEventId);
        states = await this.stateRepo
          .find({ userId: currentUserId, _id: { $gt: cursor } }) // 状态表 _id 游标，按收件人维度
          .sort({ _id: 1 })
          .limit(HISTORY_LIMIT);
      } catch {
        this.logger.warn(`[MessageManager] lastEventId 非法: ${lastEventId}，退化为按未读拉取`);
        states = await this.findUnreadStates(currentUserId);
      }
    } else {
      this.logger.log(`[MessageManager] 为用户 ${currentUserId} 检索历史未读消息...`);
      states = await this.findUnreadStates(currentUserId);
    }

    if (states.length === 0) return [];
    return this.joinBodies(states);
  }

  // 工具：把一批状态记录批量 join 本体,组装成 payload[]（一次 $in 查询,避免 N+1）。
  private async joinBodies(states: any[]): Promise<MessagePayload[]> {
    const messageIds = states.map((s) => s.messageId);
    const bodies = await this.messageRepo.find({ _id: { $in: messageIds } });
    const bodyMap = new Map(bodies.map((b: any) => [b._id.toString(), b]));

    return states
      .map((s) => {
        const body = bodyMap.get(s.messageId.toString());
        return body ? this.toPayload(s, body) : null; // 本体缺失则跳过该条
      })
      .filter((p): p is MessagePayload => p !== null);
  }

  // 未读状态查询：状态表里 isRead=false 的最新一批。
  private findUnreadStates(currentUserId: string): Promise<any[]> {
    return this.stateRepo
      .find({ userId: currentUserId, isRead: false })
      .sort({ _id: -1 })
      .limit(HISTORY_LIMIT);
  }

  // 工具：将 payload 统一包装成带 id 的 SSE 事件。
  // ⚠️ 必须设置 id（= 状态表 _id）：fetch-event-source / 原生 EventSource 只有收到带 id
  //    的消息后，才会在断线重连时把它作为 Last-Event-ID 回传。冷流、热流必须统一走这里，
  //    否则客户端拿不到游标，$gt 补发逻辑永远不触发。
  private toMessageEvent(payload: MessagePayload): MessageEvent {
    return {
      id: payload._id,
      data: payload,
    } as MessageEvent;
  }

  // 工具：未读数（红点）。直接 count 状态表，走 { userId, isRead } 索引。
  countUnread(currentUserId: string): Promise<number> {
    return this.stateRepo.countDocuments({ userId: currentUserId, isRead: false });
  }

  // ===== 给 Controller 的查询 / 状态 / 发送方法 =====

  // 消息列表(分页)：查当前用户状态表 join 本体,与 SSE 下发的是同一种 payload 结构。
  async getMessageList(
    currentUserId: string,
    { page = 1, pageSize = 20 }: { page?: number; pageSize?: number },
  ): Promise<{ list: MessagePayload[]; total: number; page: number; pageSize: number }> {
    const filter = { userId: currentUserId };
    const [states, total] = await Promise.all([
      this.stateRepo.find(filter).sort({ _id: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      this.stateRepo.countDocuments(filter),
    ]);
    return { list: await this.joinBodies(states), total, page, pageSize };
  }

  // 单条详情：按 (userId + messageId) 锁定本人的投递记录,查不到即越权 / 不存在。
  async getMessageDetail(currentUserId: string, messageId: string): Promise<MessagePayload | null> {
    const state = await this.stateRepo.findOne({ userId: currentUserId, messageId });
    if (!state) return null;
    const [payload] = await this.joinBodies([state]);
    return payload ?? null;
  }

  // 标记已读：只动 (userId + 指定 messageIds) 的状态行；不传 messageIds 则一键全部已读。
  // 永远用 token 里的 userId 限定,杜绝改到别人的状态。
  markRead(currentUserId: string, messageIds?: string[]): Promise<any> {
    const filter: any = { userId: currentUserId, isRead: false };
    if (messageIds?.length) filter.messageId = { $in: messageIds };
    return this.stateRepo.updateMany(filter, { $set: { isRead: true } });
  }

  // 删除:只删当前用户自己的状态行,本体 MessageInfo 不动(其他收件人仍可见)。
  removeStates(currentUserId: string, messageIds: string[]): Promise<any> {
    return this.stateRepo.deleteMany({ userId: currentUserId, messageId: { $in: messageIds } });
  }

  // 群发:写 1 条本体 + N 条状态行。两步写入建议放事务,避免本体已落库但状态行失败。
  // 状态行落库会触发 Change Stream → handleNewMessage → 实时推给在线用户。
  async sendMessage(
    sendUserId: string,
    dto: { title: string; content: string; linkUrl?: string; sendMessageType: string; receiverIds: string[] },
  ): Promise<{ messageId: string; delivered: number }> {
    const body = await this.messageRepo.create({
      sendUserId,
      title: dto.title,
      content: dto.content,
      linkUrl: dto.linkUrl,
      sendMessageType: dto.sendMessageType,
      sendMessageTime: new Date(),
    });

    const states = dto.receiverIds.map((userId) => ({
      userId,
      messageId: body._id,
      isRead: false,
    }));
    await this.stateRepo.insertMany(states);

    return { messageId: body._id.toString(), delivered: states.length };
  }

  // 提交申请：非直接发送,落审批队列。具体审批流(谁审、审完触发 sendMessage)按业务补全。
  async applySubmit(applicantId: string, dto: any): Promise<any> {
    this.logger.log(`[MessageManager] 用户 ${applicantId} 提交群发申请,待审批`);
    // TODO: 写入审批集合 messageApply,状态 pending;审批通过后再调用 this.sendMessage(...)
    return { applied: true };
  }

  // 3. 冷热流合并管道（对外暴露给 Controller）
  //    时序保障（为什么不漏包）：
  //      T0 subscribe() → 热流 B 立即监听，锁定此刻之后的消息
  //      T1 defer 触发  → 异步开始查库
  //      T2 库返回      → 冷流 A 逐条 emit 历史消息
  //    T0~T2 极端窗口期写入的消息可能同时走冷热流 → 极小概率重复投递，
  //    建议前端基于消息 _id 做幂等去重作为兜底。
  getStreamingChannel(currentUserId: string, lastEventId?: string): Observable<MessageEvent> {
    this.logger.log(`[MessageManager] 为用户 ${currentUserId} 构建数据流合并管道`);

    // 冷流：历史消息。defer 保证只在 subscribe 时才查库；mergeMap + from 将数组展平为逐条事件。
    const historyStream$ = defer(() =>
      from(this.getHistoryMessages(currentUserId, lastEventId)),
    ).pipe(
      mergeMap((payloads: MessagePayload[]) => from(payloads)),
      map((payload) => this.toMessageEvent(payload)),
    );

    // 热流：实时消息。状态表按收件人拆开，一个信封只对应一个收件人，直接比对 targetUserId。
    const realTimeStream$ = this.messageCenter$.pipe(
      filter((envelope) => envelope.targetUserId === currentUserId),
      map((envelope) => this.toMessageEvent(envelope.payload)),
    );

    // merge 同步完成：B 流 T0 瞬间生效，A 流随后异步展开，实现 0 漏包。
    // takeUntil 为长连接兜底，4 小时强制关闭防止僵尸连接内存泄漏。
    return merge(historyStream$, realTimeStream$).pipe(
      takeUntil(timer(SSE_MAX_LIFETIME_MS)),
    );
  }

  onModuleDestroy() {
    this.messageCenter$.complete();
  }
}
```

sse/service.ts

```js
import { Injectable, MessageEvent } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, Subscription } from 'rxjs';

const HEARTBEAT_MS = 30_000; // 心跳间隔

@Injectable()
export class SseTransportService {
  attach(channel$: Observable<MessageEvent>, req: Request, res: Response): Subscription {
    // 1. SSE 标准响应头 + 禁用反向代理缓冲
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 关键：禁 Nginx 缓冲，否则前端迟迟收不到事件
    res.flushHeaders();
    res.write(': connected\n\n');

    // 2. 心跳：定时写注释帧，防止代理 / 负载均衡因空闲断开长连接
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, HEARTBEAT_MS);

    // 3. 订阅业务流，逐条写 id:/data: 帧
    const subscription = channel$.subscribe({
      next: (msg) => this.writeEvent(res, msg),
      error: () => this.close(res, heartbeat),
      complete: () => this.close(res, heartbeat), // takeUntil(4h) 触发后走这里
    });

    // 4. 客户端断开 → 释放订阅与心跳，避免泄漏
    req.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
    });

    return subscription;
  }

  // id 行即 Last-Event-ID 语义；data 为前端可直接 merge 的 JSON
  private writeEvent(res: Response, msg: MessageEvent): void {
    if (res.writableEnded) return;
    if (msg.id !== undefined) res.write(`id: ${msg.id}\n`);
    res.write(`data: ${JSON.stringify(msg.data)}\n\n`);
  }

  private close(res: Response, heartbeat: NodeJS.Timeout): void {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
}
```

# 前端

service/message.ts

```js
import request from './request'

const BASE = '/label-platform-admin/message'

// 查询
export function getAllMessages(data?: { page?: number; pageSize?: number }) {
  return request.get<void, any>(`${BASE}/get-all`, { params: data })
}
export function getMessageDetail(data: { messageId: string }) {
  return request.get<void, any>(`${BASE}/get-detail`, { params: data })
}
export function getUnreadCount() {
  return request.get<void, { count: number }>(`${BASE}/unread-count`)
}

// 发送
export function applySubmit(data: any) {
  return request.post<void, any>(`${BASE}/apply-submit`, data)
}
export function sendMessage(data: any) {
  return request.post<void, any>(`${BASE}/send`, data)
}

// 状态
export function readMessage(data: { messageId: string }) {
  return request.post<void, any>(`${BASE}/read`, data)
}
export function batchRead(data?: { messageIds?: string[] }) {
  return request.post<void, any>(`${BASE}/batch-read`, data)
}
export function deleteMessage(data: { messageId: string }) {
  return request.post<void, any>(`${BASE}/delete`, data)
}
export function batchDelete(data: { messageIds: string[] }) {
  return request.post<void, any>(`${BASE}/batch-delete`, data)
}
```

useAppCore.ts

```js
// --- 模块级状态（跨调用持久） ---
let _sseCtrl: AbortController | null = null
let _lastEventId: string | null = null
let _retryDelay = 5000

// 去重用 Set，存放已处理的消息 _id
const _seenIds = new Set<string>()

const connectSSE = async () => {
  if (_sseCtrl) return

  _sseCtrl = new AbortController()

  fetchEventSource('/api/label-platform-admin/message/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
      ...(_lastEventId ? { 'last-event-id': _lastEventId } : {}),
    },
    body: JSON.stringify({}),
    signal: _sseCtrl.signal,

    onopen: async (response) => {
      if (response.ok) {
        // 连接成功，重置退避计时器
        _retryDelay = 5000
        return
      }
      // 4xx 类错误不重连，直接抛出让 onerror 处理
      throw new Error(`SSE open failed: ${response.status}`)
    },

    onmessage(event) {
      // 每条有 id 的消息都更新游标，确保断线重连时能补发
      if (event.id) {
        _lastEventId = event.id
      }

      // 心跳帧等空 data 直接忽略
      if (!event.data) return

      try {
        const msg = JSON.parse(event.data)

        // 幂等去重：冷热流窗口期可能重复投递同一条消息。
        // msg._id 是状态表 userMessageStates 的 _id（按收件人维度唯一），与游标 event.id 同源。
        const msgId: string | undefined = msg?._id
        if (msgId) {
          if (_seenIds.has(msgId)) return
          _seenIds.add(msgId)
          // 防止 Set 无限增长：超过阈值时清除较早的一半
          if (_seenIds.size > 500) {
            const half = [..._seenIds].slice(0, 250)
            half.forEach(id => _seenIds.delete(id))
          }
        }

        messageStore.addMessage(msg)
      } catch {
        // 非 JSON 内容（心跳文本等）忽略
      }
    },

    onclose() {
      // 服务端主动关闭（如 4h 超时后），_sseCtrl 清空，
      // 不在这里主动重连——让上层业务决定是否需要续连
      _sseCtrl = null
    },

    onerror(err: any) {
      _sseCtrl = null

      // 身份失效，不重连
      if (err?.status === 401 || err?.status === 403) {
        throw err
      }

      // 网络抖动：指数退避重连，上限 60 秒
      const delay = _retryDelay
      _retryDelay = Math.min(_retryDelay * 1.5, 60_000)

      setTimeout(() => connectSSE(), delay)

      // 抛出以阻止 fetch-event-source 的内置自动重连（由我们自己接管）
      throw err
    },
  })
}

const disconnectSSE = () => {
  _sseCtrl?.abort()
  _sseCtrl = null
}
```
