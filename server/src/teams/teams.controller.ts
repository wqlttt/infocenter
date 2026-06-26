import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { CreateTeamDto } from './dto/create-team.dto';
import { ApproveMemberDto } from './dto/approve-member.dto';
import { JoinRequestDto } from './dto/join-request.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamsController {
  constructor(private teamsService: TeamsService) {}

  @Get()
  list() {
    return this.teamsService.findAll();
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateTeamDto) {
    return this.teamsService.create(dto);
  }

  @Post('join-request')
  @Roles('member')
  joinRequest(@Body() dto: JoinRequestDto, @CurrentUser() user: AuthUser) {
    return this.teamsService.requestJoin(dto.teamId, user);
  }

  @Get(':id/members')
  @Roles('admin', 'leader')
  members(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.teamsService.getMembers(id, user);
  }

  @Post(':id/members/approve')
  @Roles('admin', 'leader')
  approveMember(
    @Param('id') id: string,
    @Body() dto: ApproveMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.teamsService.approveJoinRequest(id, dto.userId, user);
  }
}
