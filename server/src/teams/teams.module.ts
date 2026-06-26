import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { MessagesModule } from '../messages/messages.module';
import { Team, TeamSchema } from './schemas/team.schema';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Team.name, schema: TeamSchema }]),
    UsersModule,
    forwardRef(() => MessagesModule),
  ],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService, MongooseModule],
})
export class TeamsModule {}
