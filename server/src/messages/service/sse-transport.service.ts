import { Injectable, MessageEvent } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, Subscription } from 'rxjs';

const HEARTBEAT_MS = 30_000;

@Injectable()
export class SseTransportService {
  attach(channel$: Observable<MessageEvent>, req: Request, res: Response): Subscription {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': connected\n\n');

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, HEARTBEAT_MS);

    const subscription = channel$.subscribe({
      next: (msg) => this.writeEvent(res, msg),
      error: () => this.close(res, heartbeat),
      complete: () => this.close(res, heartbeat),
    });

    req.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
    });

    return subscription;
  }

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
