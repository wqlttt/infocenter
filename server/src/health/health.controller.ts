import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private connection: Connection) {}

  @Get()
  async check() {
    const state = this.connection.readyState;
    return {
      status: state === 1 ? 'ok' : 'degraded',
      mongodb: state === 1 ? 'connected' : 'disconnected',
    };
  }
}
