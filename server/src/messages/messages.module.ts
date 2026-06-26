import { forwardRef, Module } from '@nestjs/common';
import { TeamsModule } from '../teams/teams.module';
import { MongooseModule } from '@nestjs/mongoose';
import { MessagesController } from './controller/messages.controller';
import { MessagesManager } from './manager/messages.manager';
import { MessagesPollManager } from './manager/messages-poll.manager';
import { MessageChangeStreamService } from './service/message-change-stream.service';
import { MessagesService } from './service/messages.service';
import { SseTransportService } from './service/sse-transport.service';
import {
  MessageInfo,
  MessageInfoSchema,
  UserMessageState,
  UserMessageStateSchema,
} from './schemas/message.schema';

@Module({
  imports: [
    forwardRef(() => TeamsModule),
    MongooseModule.forFeature([
      { name: MessageInfo.name, schema: MessageInfoSchema },
      { name: UserMessageState.name, schema: UserMessageStateSchema },
    ]),
  ],
  controllers: [MessagesController],
  providers: [
    MessagesService,
    SseTransportService,
    MessagesManager,
    MessagesPollManager,
    MessageChangeStreamService,
  ],
  exports: [MessagesManager, MessagesPollManager, MessagesService],
})
export class MessagesModule {}
