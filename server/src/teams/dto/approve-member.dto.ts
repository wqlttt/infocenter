import { IsMongoId, IsNotEmpty } from 'class-validator';

export class ApproveMemberDto {
  @IsMongoId()
  @IsNotEmpty()
  userId!: string;
}
