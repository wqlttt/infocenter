import { IsMongoId, IsNotEmpty } from 'class-validator';

export class JoinRequestDto {
  @IsMongoId()
  @IsNotEmpty()
  teamId!: string;
}
