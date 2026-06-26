import { IsMongoId, IsString, MinLength } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsMongoId()
  leaderId: string;
}
