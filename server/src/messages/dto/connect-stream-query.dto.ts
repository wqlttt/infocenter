import { IsOptional } from 'class-validator';

/** SSE 建连 body（fetch-event-source POST），lastEventId 兜底用 */
export class ConnectMessageStreamDto {

// class-validator 的装饰器
// 表示这个字段是可选的
// 如果这个字段没有传（即 undefined），则不进行验证 ——【完全正确】
// 如果这个字段传了，则进行验证 ——【完全正确】
  @IsOptional()
  lastEventId?: string;
}
