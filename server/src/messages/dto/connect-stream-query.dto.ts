import { IsOptional } from 'class-validator';

/** SSE 建连 body（fetch-event-source POST），lastEventId 兜底用 */
export class ConnectMessageStreamDto {
  @IsOptional()
  lastEventId?: string;
}
